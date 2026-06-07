import {
  prisma,
  PaymentStatus,
  TransactionStatus,
  ProviderError,
  type PaymentJob,
  type MpesaResult,
} from '@coffepay/shared';
import { processPaymentJob } from './payment.worker.js';

const NUIT = 'TST21000001';
let merchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T21 Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: `t21-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade sessions → payments → tx → providerReq
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makePayment(status: PaymentStatus = PaymentStatus.INITIATED) {
  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId: `t21-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status: 'PROCESSING',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return prisma.payment.create({
    data: { sessionId: session.id, clientId, idempotencyKey: `k-${seq++}`, status },
  });
}

function job(paymentId: string, msisdn = '258841234567'): PaymentJob {
  return {
    paymentId,
    sessionId: '',
    msisdn,
    amountMZN: '635.00',
    reference: paymentId.slice(0, 18),
    thirdPartyReference: `tpr-${seq++}`,
  };
}

const okResult: MpesaResult = {
  success: true,
  code: 'INS-0',
  transactionId: 'TX1',
  raw: { output_ResponseCode: 'INS-0' },
};
const declinedResult: MpesaResult = {
  success: false,
  code: 'INS-996',
  message: 'declined',
  raw: { output_ResponseCode: 'INS-996' },
};

describe('processPaymentJob', () => {
  test('success: Payment + Transaction SUCCESS, ProviderRequest persisted', async () => {
    const p = await makePayment();
    const out = await processPaymentJob(job(p.id), { c2b: async () => okResult });
    expect(out.status).toBe(PaymentStatus.SUCCESS);

    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    expect(tx?.status).toBe(TransactionStatus.SUCCESS);
    expect(tx?.confirmedAt).toBeTruthy();

    const reqs = await prisma.providerRequest.findMany({ where: { transactionId: tx!.id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]?.provider).toBe('MPESA');
    expect(reqs[0]?.responsePayload).toMatchObject({ output_ResponseCode: 'INS-0' });

    const payment = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(payment?.status).toBe(PaymentStatus.SUCCESS);
    expect(payment?.completedAt).toBeTruthy();
    expect(payment?.attempts).toBe(1);
  });

  test('declined: Payment + Transaction FAILED, no confirmedAt', async () => {
    const p = await makePayment();
    const out = await processPaymentJob(job(p.id, '258841234569'), {
      c2b: async () => declinedResult,
    });
    expect(out.status).toBe(PaymentStatus.FAILED);

    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    expect(tx?.status).toBe(TransactionStatus.FAILED);
    expect(tx?.confirmedAt).toBeNull();
  });

  test('idempotent: a terminal payment is skipped and c2b is not called', async () => {
    const p = await makePayment(PaymentStatus.SUCCESS);
    let called = false;
    const out = await processPaymentJob(job(p.id), {
      c2b: async () => {
        called = true;
        return okResult;
      },
    });
    expect(out.skipped).toBe(true);
    expect(called).toBe(false);
    expect(await prisma.transaction.count({ where: { paymentId: p.id } })).toBe(0);
  });

  test('network error propagates for retry; payment is left non-terminal', async () => {
    const p = await makePayment();
    await expect(
      processPaymentJob(job(p.id), {
        c2b: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    ).rejects.toThrow('ECONNREFUSED');

    const payment = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(payment?.status).not.toBe(PaymentStatus.SUCCESS);
    expect(payment?.status).not.toBe(PaymentStatus.FAILED);
  });

  test('unknown payment id is dropped (skipped, no throw)', async () => {
    const out = await processPaymentJob(job('00000000-0000-0000-0000-000000000000'), {
      c2b: async () => okResult,
    });
    expect(out.skipped).toBe(true);
  });
});

// T33: a provider outage holds the job in the queue (transient error → the
// worker propagates it so BullMQ retries); on recovery the SAME job resumes to
// success, with no double debit.
describe('connectivity outage hold/resume (T33)', () => {
  test('held during outage, resumes to success without double debit', async () => {
    const p = await makePayment();
    const j = job(p.id);

    let providerUp = false;
    const c2b = async () => {
      if (!providerUp) throw new ProviderError('outage', { netCode: 'ECONNREFUSED' });
      return okResult;
    };

    // Provider down: transient error propagates (held for retry).
    await expect(processPaymentJob(j, { c2b })).rejects.toBeInstanceOf(ProviderError);

    let payment = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(payment?.status).not.toBe(PaymentStatus.SUCCESS);
    expect(payment?.status).not.toBe(PaymentStatus.FAILED); // still held
    expect(payment?.attempts).toBe(1);

    // Provider recovers: the same job resumes and completes.
    providerUp = true;
    const out = await processPaymentJob(j, { c2b });
    expect(out.status).toBe(PaymentStatus.SUCCESS);

    payment = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(payment?.status).toBe(PaymentStatus.SUCCESS);

    // No double debit: exactly one transaction and one DEBIT ledger entry.
    expect(await prisma.transaction.count({ where: { paymentId: p.id } })).toBe(1);
    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    const debits = await prisma.ledgerEntry.count({
      where: { transactionId: tx!.id, entryType: 'DEBIT' },
    });
    expect(debits).toBe(1);
  });
});
