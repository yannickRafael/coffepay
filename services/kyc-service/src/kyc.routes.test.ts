import request from 'supertest';
import { prisma } from '@coffepay/shared';
import { createApp } from './app.js';
import { hashPhone } from './phone.js';

const app = createApp();
const PHONE = '258841999001';

afterAll(async () => {
  const client = await prisma.client.findUnique({ where: { phoneHash: hashPhone(PHONE) } });
  if (client) {
    await prisma.auditLog.deleteMany({ where: { entityType: 'Client', entityId: client.id } });
    await prisma.client.delete({ where: { id: client.id } });
  }
  await prisma.$disconnect();
});

describe('POST /kyc/validate', () => {
  test('returns 200 with the decision', async () => {
    const res = await request(app).post('/kyc/validate').send({ phone: PHONE, amountMZN: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.riskLevel).toBe('LOW');
    expect(typeof res.body.clientId).toBe('string');
  });

  test('invalid body → 400', async () => {
    const res = await request(app).post('/kyc/validate').send({ phone: 'nope', amountMZN: -1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
