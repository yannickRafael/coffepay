import {
  prisma,
  ValidationError,
  ConflictError,
  ForbiddenError,
  SessionStatus,
  hashPhone,
  type PaymentJob,
} from '@coffepay/shared';
import { confirmPayment } from './pay.service.js';
import type { KycCheckResult } from './kyc.client.js';

const NUIT = 'TST20B00001';
const PHONE = '0841234567';
const MSISDN = '258841234567';
let merchantId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T20b Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade sessions → payments → idem keys
  await prisma.client.deleteMany({ where: { phoneHash: hashPhone(PHONE) } });
  await prisma.$disconnect();
});

let seq = 0;
async function makeSession(status: SessionStatus = SessionStatus.PENDING, expiresInMs = 60_000) {
  return prisma.session.create({
    data: {
      merchantId,
      orderId: `t20b-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status,
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
}

const allow: () => Promise<KycCheckResult> = async () => ({
  clientId: 'stub',
  allowed: true,
  riskLevel: 'LOW',
  reasons: [],
});
const block: () => Promise<KycCheckResult> = async () => ({
  clientId: 'stub',
  allowed: false,
  riskLevel: 'HIGH',
  reasons: ['BLACKLISTED'],
});

function jobCollector() {
  const jobs: PaymentJob[] = [];
  return {
    jobs,
    enqueue: async (job: PaymentJob) => {
      jobs.push(job);
    },
  };
}

describe('confirmPayment — success', () => {
  test('creates Payment + IdempotencyKey, moves session to PROCESSING, enqueues one job', async () => {
    const s = await makeSession();
    const { jobs, enqueue } = jobCollector();

    const res = await confirmPayment(s.id, PHONE, 'k-success', { kycCheck: allow, enqueue });
    expect(res.status).toBe(SessionStatus.PROCESSING);
    expect(res.sessionId).toBe(s.id);

    const payment = await prisma.payment.findUnique({ where: { id: res.paymentId } });
    expect(payment?.status).toBe('INITIATED');
    expect(payment?.sessionId).toBe(s.id);

    const idem = await prisma.idempotencyKey.findUnique({ where: { key: 'k-success' } });
    expect(idem?.paymentId).toBe(res.paymentId);

    const session = await prisma.session.findUnique({ where: { id: s.id } });
    expect(session?.status).toBe(SessionStatus.PROCESSING);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      paymentId: res.paymentId,
      sessionId: s.id,
      msisdn: MSISDN,
      amountMZN: '635.00',
    });
  });

  test('defaults the idempotency key to session:<id> when no header is given', async () => {
    const s = await makeSession();
    const { enqueue } = jobCollector();
    const res = await confirmPayment(s.id, PHONE, undefined, { kycCheck: allow, enqueue });

    const idem = await prisma.idempotencyKey.findUnique({ where: { key: `session:${s.id}` } });
    expect(idem?.paymentId).toBe(res.paymentId);
  });
});

describe('confirmPayment — idempotency (RF14)', () => {
  test('replays the same key without a second payment or job', async () => {
    const s = await makeSession();
    const first = jobCollector();
    const r1 = await confirmPayment(s.id, PHONE, 'k-replay', {
      kycCheck: allow,
      enqueue: first.enqueue,
    });

    const second = jobCollector();
    const r2 = await confirmPayment(s.id, PHONE, 'k-replay', {
      kycCheck: allow,
      enqueue: second.enqueue,
    });

    expect(r2.paymentId).toBe(r1.paymentId);
    expect(first.jobs).toHaveLength(1);
    expect(second.jobs).toHaveLength(0); // replay enqueues nothing

    const count = await prisma.payment.count({ where: { sessionId: s.id } });
    expect(count).toBe(1);
  });
});

describe('confirmPayment — guards', () => {
  test('KYC-blocked payment throws ForbiddenError and leaves the session PENDING', async () => {
    const s = await makeSession();
    const { jobs, enqueue } = jobCollector();

    await expect(
      confirmPayment(s.id, PHONE, 'k-blocked', { kycCheck: block, enqueue }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const session = await prisma.session.findUnique({ where: { id: s.id } });
    expect(session?.status).toBe(SessionStatus.PENDING);
    expect(await prisma.payment.count({ where: { sessionId: s.id } })).toBe(0);
    expect(jobs).toHaveLength(0);
  });

  test('invalid MSISDN throws ValidationError and enqueues nothing', async () => {
    const s = await makeSession();
    const { jobs, enqueue } = jobCollector();
    await expect(
      confirmPayment(s.id, '12345', 'k-badphone', { kycCheck: allow, enqueue }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(jobs).toHaveLength(0);
  });

  test('non-PENDING session throws ConflictError', async () => {
    const s = await makeSession(SessionStatus.COMPLETED);
    const { enqueue } = jobCollector();
    await expect(
      confirmPayment(s.id, PHONE, 'k-completed', { kycCheck: allow, enqueue }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  test('expired session throws ConflictError', async () => {
    const s = await makeSession(SessionStatus.PENDING, -60_000);
    const { enqueue } = jobCollector();
    await expect(
      confirmPayment(s.id, PHONE, 'k-expired', { kycCheck: allow, enqueue }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
