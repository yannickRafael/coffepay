import request from 'supertest';
import { prisma, SessionStatus } from '@coffepay/shared';
import { createApp } from './app.js';

const app = createApp();
const NUIT = 'TST19000001';
let merchantId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T19 Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { merchantId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makeSession(status: SessionStatus, expiresAt: Date) {
  return prisma.session.create({
    data: {
      merchantId,
      orderId: `t19-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status,
      expiresAt,
    },
  });
}

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('GET /checkout/:id', () => {
  test('renders the form for a payable session', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    const res = await request(app).get(`/checkout/${s.id}`);
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Confirmar pagamento');
    expect(res.text).toContain('635.00');
    expect(res.text).toContain('MZN');
    expect(res.text).toContain(`/sessions/${s.id}/pay`);
    expect(res.text).toContain('validate-phone');
    expect(res.text).toContain('Idempotency-Key');
  });

  test('renders a state page for a completed session (no form)', async () => {
    const s = await makeSession(SessionStatus.COMPLETED, future());
    const res = await request(app).get(`/checkout/${s.id}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Confirmar pagamento');
    expect(res.text).toContain('COMPLETED');
  });

  test('renders EXPIRED for a past-due PENDING session', async () => {
    const s = await makeSession(SessionStatus.PENDING, past());
    const res = await request(app).get(`/checkout/${s.id}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Confirmar pagamento');
    expect(res.text).toContain('EXPIRED');
  });

  test('404 for an unknown session', async () => {
    const res = await request(app).get('/checkout/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.type).toMatch(/html/);
  });
});

describe('GET /checkout/:id/return', () => {
  test('terminal session redirects (302) to merchant callbackUrl with session+status', async () => {
    const s = await makeSession(SessionStatus.COMPLETED, future());
    const res = await request(app).get(`/checkout/${s.id}/return`).redirects(0);
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(`${loc.origin}${loc.pathname}`).toBe('https://m.example/cb');
    expect(loc.searchParams.get('session')).toBe(s.id);
    expect(loc.searchParams.get('status')).toBe('COMPLETED');
  });

  test('failed session carries status=FAILED', async () => {
    const s = await makeSession(SessionStatus.FAILED, future());
    const res = await request(app).get(`/checkout/${s.id}/return`).redirects(0);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('status')).toBe('FAILED');
  });

  test('past-due PENDING session redirects with status=EXPIRED', async () => {
    const s = await makeSession(SessionStatus.PENDING, past());
    const res = await request(app).get(`/checkout/${s.id}/return`).redirects(0);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location).searchParams.get('status')).toBe('EXPIRED');
  });

  test('in-progress session redirects back to the checkout (no merchant redirect)', async () => {
    const s = await makeSession(SessionStatus.PROCESSING, future());
    const res = await request(app).get(`/checkout/${s.id}/return`).redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/checkout/${s.id}`);
  });

  test('does not leak sensitive data in the redirect query', async () => {
    const s = await makeSession(SessionStatus.COMPLETED, future());
    const res = await request(app).get(`/checkout/${s.id}/return`).redirects(0);
    const loc = new URL(res.headers.location);
    expect([...loc.searchParams.keys()].sort()).toEqual(['session', 'status']);
  });

  test('404 for an unknown session', async () => {
    const res = await request(app).get('/checkout/00000000-0000-0000-0000-000000000000/return');
    expect(res.status).toBe(404);
  });
});

describe('GET /sessions/:id', () => {
  test('returns the public JSON view without internal fields', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    const res = await request(app).get(`/sessions/${s.id}`);
    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(s.id);
    expect(res.body.merchantName).toBe('T19 Merchant');
    expect(res.body.amountMZN).toBe('635.00');
    expect(res.body).not.toHaveProperty('callbackUrl');
    expect(res.body).not.toHaveProperty('fxRateId');
  });

  test('404 for an unknown session', async () => {
    const res = await request(app).get('/sessions/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('POST /sessions/:id/validate-phone', () => {
  test('accepts a valid MSISDN and returns the canonical form', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    const res = await request(app)
      .post(`/sessions/${s.id}/validate-phone`)
      .send({ phone: '0841234567' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true, msisdn: '258841234567' });
  });

  test('rejects an invalid MSISDN with 400', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    const res = await request(app)
      .post(`/sessions/${s.id}/validate-phone`)
      .send({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('409 when the session is not PENDING', async () => {
    const s = await makeSession(SessionStatus.COMPLETED, future());
    const res = await request(app)
      .post(`/sessions/${s.id}/validate-phone`)
      .send({ phone: '0841234567' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  test('409 when the session has expired', async () => {
    const s = await makeSession(SessionStatus.PENDING, past());
    const res = await request(app)
      .post(`/sessions/${s.id}/validate-phone`)
      .send({ phone: '0841234567' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });
});
