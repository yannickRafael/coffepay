import {
  prisma,
  c2bPayment,
  processResult,
  loadMpesaConfig,
  ValidationError,
  ForbiddenError,
  PaymentStatus,
  TransactionStatus,
  SessionStatus,
  hashPhone,
  type PaymentJob,
  type MerchantNotifyJob,
} from '@coffepay/shared';
import { createSession } from './session.service.js';
import { confirmPayment } from './pay.service.js';
import { getReturnTarget } from './session.service.js';
import { expireStuckPayments } from './payment.timeout.js';
import type { Quote } from './fx.client.js';
import type { KycCheckResult } from './kyc.client.js';

const NUIT = `TST38${Date.now()}`.slice(0, 14);
let merchantId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: {
      name: 'T38 Merchant',
      nuit: NUIT,
      status: 'ACTIVE',
      webhooks: {
        create: { url: 'https://m.example/hook', events: 'payment.success,payment.failed' },
      },
    },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade
  await prisma.client.deleteMany({ where: { phoneHash: hashPhone('258841234560') } });
  await prisma.client.deleteMany({ where: { phoneHash: hashPhone('258841230000') } });
  await prisma.$disconnect();
});

const MOCK_CFG = loadMpesaConfig({ MPESA_MOCK: 'true' });

// Real FXRate row so the Session FK is satisfied (mirrors fx-service output).
async function makeQuote(amountUSD: number, rate = 63.5): Promise<Quote> {
  const base = amountUSD * rate;
  const fee = base * 0.025;
  const row = await prisma.fXRate.create({
    data: {
      fromCurrency: 'USD',
      toCurrency: 'MZN',
      rate: rate.toFixed(6),
      serviceFee: fee.toFixed(2),
      expiresAt: new Date(Date.now() + 900_000),
    },
  });
  return {
    fxRateId: row.id,
    rate: rate.toString(),
    serviceFee: fee.toFixed(2),
    amountMZN: (base + fee).toFixed(2),
    expiresAt: row.expiresAt.toISOString(),
  };
}

const allowKyc = async (): Promise<KycCheckResult> => ({
  clientId: 'stub',
  allowed: true,
  riskLevel: 'LOW',
  reasons: [],
});
const blockKyc = async (): Promise<KycCheckResult> => ({
  clientId: 'stub',
  allowed: false,
  riskLevel: 'HIGH',
  reasons: ['BLACKLISTED'],
});

function notifyCollector() {
  const jobs: MerchantNotifyJob[] = [];
  return { jobs, notify: async (j: MerchantNotifyJob) => void jobs.push(j) };
}

let seq = 0;
async function newSession(amountUSD = 10): Promise<string> {
  const quote = await makeQuote(amountUSD);
  const res = await createSession(
    { orderId: `t38-${seq++}`, amountUSD, callbackUrl: 'https://m.example/return' },
    merchantId,
    async () => quote,
  );
  return res.sessionId;
}

// Run the worker step against the deterministic C2B mock + the shared handler.
async function runWorker(job: PaymentJob, notify: MerchantNotifyJob[] | undefined) {
  const result = await c2bPayment(
    {
      amount: job.amountMZN,
      msisdn: job.msisdn,
      reference: job.reference,
      thirdPartyReference: job.thirdPartyReference,
    },
    MOCK_CFG,
  );
  return processResult(
    {
      paymentId: job.paymentId,
      result,
      request: {
        amount: job.amountMZN,
        msisdn: job.msisdn,
        reference: job.reference,
        thirdPartyReference: job.thirdPartyReference,
      },
    },
    notify ? { notify: async (j) => void notify.push(j) } : {},
  );
}

describe('e2e — happy path (T38)', () => {
  test('session → pay → C2B success → ledger → COMPLETED → return redirect', async () => {
    const sessionId = await newSession();
    const enqueued: PaymentJob[] = [];
    const pay = await confirmPayment(sessionId, '258841234560', 'e2e-ok', {
      kycCheck: allowKyc,
      enqueue: async (j) => void enqueued.push(j),
    });
    expect(pay.status).toBe(SessionStatus.PROCESSING);
    expect(enqueued).toHaveLength(1);

    const notif = notifyCollector();
    const out = await runWorker(enqueued[0]!, notif.jobs);
    expect(out.status).toBe(PaymentStatus.SUCCESS);

    const payment = await prisma.payment.findUnique({ where: { id: pay.paymentId } });
    expect(payment?.status).toBe(PaymentStatus.SUCCESS);

    const tx = await prisma.transaction.findUnique({ where: { paymentId: pay.paymentId } });
    expect(tx?.status).toBe(TransactionStatus.SUCCESS);
    const ledger = await prisma.ledgerEntry.findMany({ where: { transactionId: tx!.id } });
    expect(ledger.map((l) => l.entryType).sort()).toEqual(['CREDIT', 'DEBIT']);

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session?.status).toBe(SessionStatus.COMPLETED);

    expect(notif.jobs).toHaveLength(1);
    expect(notif.jobs[0]?.event).toBe('payment.success');

    const ret = await getReturnTarget(sessionId);
    expect(ret.terminal).toBe(true);
    expect(ret.status).toBe('COMPLETED');
    expect(ret.redirectUrl).toContain('status=COMPLETED');
  });
});

describe('e2e — alternate branches (T38)', () => {
  test('invalid phone → ValidationError, no payment', async () => {
    const sessionId = await newSession();
    await expect(
      confirmPayment(sessionId, '12345', 'e2e-badphone', {
        kycCheck: allowKyc,
        enqueue: async () => {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await prisma.payment.count({ where: { sessionId } })).toBe(0);
  });

  test('KYC blocked → ForbiddenError, session stays PENDING', async () => {
    const sessionId = await newSession();
    await expect(
      confirmPayment(sessionId, '258841234560', 'e2e-block', {
        kycCheck: blockKyc,
        enqueue: async () => {},
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session?.status).toBe(SessionStatus.PENDING);
  });

  test('provider decline (msisdn ending 0000) → FAILED, no ledger', async () => {
    const sessionId = await newSession();
    const enqueued: PaymentJob[] = [];
    const pay = await confirmPayment(sessionId, '258841230000', 'e2e-decline', {
      kycCheck: allowKyc,
      enqueue: async (j) => void enqueued.push(j),
    });
    const out = await runWorker(enqueued[0]!, []);
    expect(out.status).toBe(PaymentStatus.FAILED);

    const tx = await prisma.transaction.findUnique({ where: { paymentId: pay.paymentId } });
    expect(tx?.status).toBe(TransactionStatus.FAILED);
    expect(await prisma.ledgerEntry.count({ where: { transactionId: tx!.id } })).toBe(0);

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session?.status).toBe(SessionStatus.FAILED);
  });

  test('timeout (RF08) → unconfirmed payment and session are FAILED', async () => {
    const sessionId = await newSession();
    const pay = await confirmPayment(sessionId, '258841234560', 'e2e-timeout', {
      kycCheck: allowKyc,
      enqueue: async () => {},
    });
    // Age THIS payment past the timeout window, then run the sweep with the
    // default clock — so only this payment is stuck (no impact on parallel tests).
    await prisma.payment.update({
      where: { id: pay.paymentId },
      data: { initiatedAt: new Date(Date.now() - 10 * 60 * 1000) },
    });
    const failed = await expireStuckPayments();
    expect(failed).toBeGreaterThanOrEqual(1);

    const payment = await prisma.payment.findUnique({ where: { id: pay.paymentId } });
    expect(payment?.status).toBe(PaymentStatus.FAILED);
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    expect(session?.status).toBe(SessionStatus.FAILED);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'PAYMENT_TIMEOUT', entityId: pay.paymentId },
    });
    expect(audit).not.toBeNull();
  });

  test('idempotent reprocess → no double ledger or notification (RNF05)', async () => {
    const sessionId = await newSession();
    const enqueued: PaymentJob[] = [];
    const pay = await confirmPayment(sessionId, '258841234560', 'e2e-idem', {
      kycCheck: allowKyc,
      enqueue: async (j) => void enqueued.push(j),
    });

    const notif = notifyCollector();
    await runWorker(enqueued[0]!, notif.jobs);
    const second = await runWorker(enqueued[0]!, notif.jobs); // reprocess
    expect(second.idempotent).toBe(true);

    const tx = await prisma.transaction.findUnique({ where: { paymentId: pay.paymentId } });
    expect(await prisma.ledgerEntry.count({ where: { transactionId: tx!.id } })).toBe(2); // one pair
    expect(notif.jobs).toHaveLength(1); // not notified twice
  });
});
