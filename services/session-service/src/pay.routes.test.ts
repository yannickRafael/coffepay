import request from 'supertest';
import { prisma, SessionStatus } from '@coffepay/shared';
import { createApp } from './app.js';

const app = createApp();
const NUIT = 'TST20BR0001';
let merchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T20b Route Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: `t20br-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade sessions → payments → idem
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makeSession(status: SessionStatus = SessionStatus.PENDING, expiresInMs = 60_000) {
  return prisma.session.create({
    data: {
      merchantId,
      orderId: `t20br-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status,
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });
}

describe('POST /sessions/:id/pay', () => {
  test('missing phone → 400 (no KYC call reached)', async () => {
    const s = await makeSession();
    const res = await request(app).post(`/sessions/${s.id}/pay`).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('non-PENDING session → 409', async () => {
    const s = await makeSession(SessionStatus.COMPLETED);
    const res = await request(app).post(`/sessions/${s.id}/pay`).send({ phone: '0841234567' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  test('honors Idempotency-Key and replays the stored result (202, no KYC)', async () => {
    const s = await makeSession(SessionStatus.PROCESSING);
    const payment = await prisma.payment.create({
      data: { sessionId: s.id, clientId, idempotencyKey: 'route-replay', status: 'INITIATED' },
    });
    const stored = { paymentId: payment.id, sessionId: s.id, status: 'PROCESSING' };
    await prisma.idempotencyKey.create({
      data: {
        key: 'route-replay',
        paymentId: payment.id,
        result: stored,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const res = await request(app)
      .post(`/sessions/${s.id}/pay`)
      .set('Idempotency-Key', 'route-replay')
      .send({ phone: '0841234567' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual(stored);
  });
});
