import request from 'supertest';
import { QUEUE_NAMES, closeQueues, prisma } from '@coffepay/shared';
import { createApp } from './app.js';
import { gatewayConfig } from './config.js';

const ADMIN_KEY = 'admin-test-key';
const app = createApp({ ...gatewayConfig(), ADMIN_API_KEY: ADMIN_KEY });

afterAll(async () => {
  await closeQueues();
});

describe('admin DLQ routes (T34)', () => {
  test('rejects requests without the admin key (401)', async () => {
    const res = await request(app).get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`);
    expect(res.status).toBe(401);
  });

  test('rejects a wrong admin key (401)', async () => {
    const res = await request(app)
      .get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`)
      .set('X-Admin-Key', 'nope');
    expect(res.status).toBe(401);
  });

  test('lists dead letters with the admin key (200)', async () => {
    const res = await request(app)
      .get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.queue).toBe(QUEUE_NAMES.paymentProcessDlq);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('rejects an unknown queue name (400)', async () => {
    const res = await request(app).get('/admin/dlq/not-a-queue').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });
});

describe('admin settlement routes (T44/T45)', () => {
  let merchantId: string;
  const clientPhone = `gw-settle-${Date.now()}`;

  beforeAll(async () => {
    const m = await prisma.merchant.create({
      data: { name: 'GW Settle', nuit: `GWS${Date.now()}`.slice(0, 14), status: 'ACTIVE' },
    });
    merchantId = m.id;
    const c = await prisma.client.create({ data: { phoneHash: clientPhone } });
    const rate = await prisma.fXRate.create({
      data: {
        fromCurrency: 'USD',
        toCurrency: 'MZN',
        rate: '63.500000',
        serviceFee: '15.88',
        expiresAt: new Date(Date.now() + 900_000),
      },
    });
    const session = await prisma.session.create({
      data: {
        merchantId,
        orderId: `gws-${Date.now()}`,
        amountUSD: '10.00',
        amountMZN: '650.88',
        callbackUrl: 'https://m.example/cb',
        status: 'COMPLETED',
        expiresAt: new Date(Date.now() + 60_000),
        fxRateId: rate.id,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        sessionId: session.id,
        clientId: c.id,
        idempotencyKey: `gws-${Date.now()}`,
        status: 'SUCCESS',
      },
    });
    await prisma.transaction.create({
      data: { paymentId: payment.id, amountMZN: '650.88', status: 'SUCCESS' },
    });
  });

  afterAll(async () => {
    await prisma.merchant.delete({ where: { id: merchantId } });
    await prisma.client.deleteMany({ where: { phoneHash: clientPhone } });
  });

  test('rejects POST /admin/settlements/run without the admin key (401)', async () => {
    const res = await request(app).post('/admin/settlements/run');
    expect(res.status).toBe(401);
  });

  test('runs settlement with the admin key and settles the pending transaction', async () => {
    const res = await request(app).post('/admin/settlements/run').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');

    const list = await request(app)
      .get(`/admin/settlements?merchantId=${merchantId}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThanOrEqual(1);
    expect(list.body.items[0].merchantId).toBe(merchantId);
  });
});
