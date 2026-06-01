import request from 'supertest';
import { prisma } from '@coffepay/shared';
import { createApp } from './app.js';

const app = createApp();
const MERCHANT_HEADER = 'x-merchant-id';
const FAKE_MERCHANT = '00000000-0000-0000-0000-000000000000';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /sessions/create — request guards', () => {
  test('missing merchant context → 401', async () => {
    const res = await request(app)
      .post('/sessions/create')
      .send({ orderId: 'o1', amountUSD: 10, callbackUrl: 'https://m.example/cb' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_ERROR');
  });

  test('invalid body → 400 (validation runs before any FX call)', async () => {
    const res = await request(app)
      .post('/sessions/create')
      .set(MERCHANT_HEADER, FAKE_MERCHANT)
      .send({ orderId: '', amountUSD: -1, callbackUrl: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
