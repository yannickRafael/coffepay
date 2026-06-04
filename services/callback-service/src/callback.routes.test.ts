import request from 'supertest';
import { prisma, PaymentStatus, TransactionStatus, SessionStatus } from '@coffepay/shared';
import { createApp } from './app.js';

const app = createApp();
// No webhook on this merchant → processResult skips notify (no Redis needed).
let merchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T23b Route', nuit: 'TST23BR0001', status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: `t23br-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

const TPR = 'TPR-ROUTE';
let seq = 0;

// Create a PENDING payment with a stored ProviderRequest carrying the expected
// third-party reference (the value processResult verifies the callback against).
async function makePaymentWithProviderRequest() {
  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId: `t23br-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status: SessionStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      sessionId: session.id,
      clientId,
      idempotencyKey: `k-${seq++}`,
      status: PaymentStatus.PENDING,
    },
  });
  const tx = await prisma.transaction.create({
    data: { paymentId: payment.id, amountMZN: '635.00', status: TransactionStatus.FAILED },
  });
  await prisma.providerRequest.create({
    data: {
      transactionId: tx.id,
      provider: 'MPESA',
      requestPayload: { thirdPartyReference: TPR },
    },
  });
  return payment;
}

describe('POST /callback/mpesa', () => {
  test('valid callback → 200 and processes the result', async () => {
    const p = await makePaymentWithProviderRequest();
    const res = await request(app).post('/callback/mpesa').send({
      paymentId: p.id,
      output_ResponseCode: 'INS-0',
      output_TransactionID: 'TX-OK',
      output_ThirdPartyReference: TPR,
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(PaymentStatus.SUCCESS);
    expect(res.body.sessionStatus).toBe(SessionStatus.COMPLETED);
  });

  test('forged third-party reference → 400', async () => {
    const p = await makePaymentWithProviderRequest();
    const res = await request(app).post('/callback/mpesa').send({
      paymentId: p.id,
      output_ResponseCode: 'INS-0',
      output_ThirdPartyReference: 'FORGED',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('invalid body → 400', async () => {
    const res = await request(app).post('/callback/mpesa').send({ paymentId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
