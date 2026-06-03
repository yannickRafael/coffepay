import { prisma, PaymentStatus, SessionStatus } from '@coffepay/shared';
import { expireStuckPayments } from './payment.timeout.js';

const NUIT = 'TST22000001';
let merchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T22 Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: `t22-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makePaymentOnSession(opts: {
  sessionStatus: SessionStatus;
  paymentStatus: PaymentStatus;
  initiatedAgoMs: number;
}) {
  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId: `t22-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status: opts.sessionStatus,
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      sessionId: session.id,
      clientId,
      idempotencyKey: `k-${seq++}`,
      status: opts.paymentStatus,
      initiatedAt: new Date(Date.now() - opts.initiatedAgoMs),
    },
  });
  return { sessionId: session.id, paymentId: payment.id };
}

const OLD = 200_000; // > default PAYMENT_TIMEOUT_MS (120000)
const RECENT = 1_000;

describe('expireStuckPayments', () => {
  test('fails a stuck PROCESSING payment and its session, with an audit', async () => {
    const { sessionId, paymentId } = await makePaymentOnSession({
      sessionStatus: SessionStatus.PROCESSING,
      paymentStatus: PaymentStatus.PENDING,
      initiatedAgoMs: OLD,
    });

    const count = await expireStuckPayments();
    expect(count).toBeGreaterThanOrEqual(1);

    expect((await prisma.payment.findUnique({ where: { id: paymentId } }))?.status).toBe(
      PaymentStatus.FAILED,
    );
    expect((await prisma.session.findUnique({ where: { id: sessionId } }))?.status).toBe(
      SessionStatus.FAILED,
    );
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Payment', entityId: paymentId, action: 'PAYMENT_TIMEOUT' },
    });
    expect(audit).not.toBeNull();
  });

  test('leaves a recent payment untouched', async () => {
    const { sessionId, paymentId } = await makePaymentOnSession({
      sessionStatus: SessionStatus.PROCESSING,
      paymentStatus: PaymentStatus.INITIATED,
      initiatedAgoMs: RECENT,
    });
    await expireStuckPayments();
    expect((await prisma.payment.findUnique({ where: { id: paymentId } }))?.status).toBe(
      PaymentStatus.INITIATED,
    );
    expect((await prisma.session.findUnique({ where: { id: sessionId } }))?.status).toBe(
      SessionStatus.PROCESSING,
    );
  });

  test('ignores a terminal payment even if old', async () => {
    const { paymentId } = await makePaymentOnSession({
      sessionStatus: SessionStatus.PROCESSING,
      paymentStatus: PaymentStatus.SUCCESS,
      initiatedAgoMs: OLD,
    });
    await expireStuckPayments();
    expect((await prisma.payment.findUnique({ where: { id: paymentId } }))?.status).toBe(
      PaymentStatus.SUCCESS,
    );
  });

  test('ignores an old payment whose session is not PROCESSING', async () => {
    const { paymentId } = await makePaymentOnSession({
      sessionStatus: SessionStatus.PENDING,
      paymentStatus: PaymentStatus.INITIATED,
      initiatedAgoMs: OLD,
    });
    await expireStuckPayments();
    expect((await prisma.payment.findUnique({ where: { id: paymentId } }))?.status).toBe(
      PaymentStatus.INITIATED,
    );
  });

  test('is idempotent on a second sweep', async () => {
    await makePaymentOnSession({
      sessionStatus: SessionStatus.PROCESSING,
      paymentStatus: PaymentStatus.PENDING,
      initiatedAgoMs: OLD,
    });
    await expireStuckPayments();
    const second = await expireStuckPayments();
    expect(second).toBe(0);
  });
});
