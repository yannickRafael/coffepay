import request from 'supertest';
import jwt from 'jsonwebtoken';
import { prisma, hashSecret } from '@coffepay/shared';
import { createApp } from './app.js';
import { gatewayConfig } from './config.js';

const RAW_KEY = 'cp_test_key_t14b';
const NUIT = 'TST14B0001';

let app: ReturnType<typeof createApp>;
let merchantId: string;

beforeAll(async () => {
  const merchant = await prisma.merchant.create({
    data: {
      name: 'T14b Merchant',
      nuit: NUIT,
      status: 'ACTIVE',
      apiKeys: { create: { type: 'DEV', keyHash: await hashSecret(RAW_KEY), isActive: true } },
    },
  });
  merchantId = merchant.id;
  app = createApp();
});

afterAll(async () => {
  await prisma.apiKey.deleteMany({ where: { merchantId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

async function getToken(): Promise<string> {
  const res = await request(app).post('/api/v1/auth/token').set('X-Api-Key', RAW_KEY);
  return res.body.token as string;
}

describe('API key → token', () => {
  test('missing key → 401', async () => {
    const res = await request(app).post('/api/v1/auth/token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_ERROR');
  });

  test('wrong key → 401', async () => {
    const res = await request(app).post('/api/v1/auth/token').set('X-Api-Key', 'nope');
    expect(res.status).toBe(401);
  });

  test('valid key → 200 + JWT', async () => {
    const res = await request(app).post('/api/v1/auth/token').set('X-Api-Key', RAW_KEY);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.tokenType).toBe('Bearer');
  });
});

describe('JWT-protected route', () => {
  test('valid token → 200 + merchantId', async () => {
    const token = await getToken();
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.merchantId).toBe(merchantId);
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  test('tampered token → 401', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('expired token → 401', async () => {
    const expired = jwt.sign({ type: 'merchant' }, gatewayConfig().JWT_SECRET, {
      subject: merchantId,
      expiresIn: -10,
    });
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('per-merchant rate limit', () => {
  test('trips after the configured max (4)', async () => {
    const token = await getToken();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
      codes.push(res.status);
    }
    // Some requests pass, then the per-merchant limiter trips. (An earlier test
    // already consumed part of this merchant's window, so don't assert an exact count.)
    expect(codes.filter((c) => c === 200).length).toBeGreaterThanOrEqual(1);
    expect(codes).toContain(429);
  });
});
