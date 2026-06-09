import request from 'supertest';
import { signPayload, SIGNATURE_HEADER } from '@coffepay/shared';
import { createApp } from './app.js';
import type { CreateSessionFn } from './store.js';
import { mockstoreConfig } from './config.js';
import { clearEvents } from './events.js';
import { clearOrders } from './orders.js';

const SECRET = () => mockstoreConfig().webhookSecret;
const noop: CreateSessionFn = async () => ({ checkoutUrl: 'x' });

beforeEach(() => {
  clearEvents();
  clearOrders();
});

describe('GET /', () => {
  test('renders the product page with a Pay with CoffePay button', async () => {
    const app = createApp({ createSession: async () => ({ checkoutUrl: 'x' }) });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Pay with CoffePay');
    expect(res.text).toContain('Dell XPS 15 Laptop');
    expect(res.text).toContain('$299.99');
    // Popup flow: button + client fetch to /buy (no plain form submit).
    expect(res.text).toContain('id="pay-btn"');
    expect(res.text).toContain("fetch('/buy'");
  });
});

describe('POST /buy', () => {
  test('creates a session and 302-redirects to the returned checkoutUrl', async () => {
    const calls: Array<{ orderId: string; amountUSD: number; callbackUrl: string }> = [];
    const createSession: CreateSessionFn = async (input) => {
      calls.push(input);
      return { checkoutUrl: 'http://localhost:3001/checkout/abc123' };
    };
    const app = createApp({ createSession });

    const res = await request(app).post('/buy').redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3001/checkout/abc123');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.amountUSD).toBe(299.99);
    expect(calls[0]!.callbackUrl).toMatch(/\/return$/);
    expect(calls[0]!.orderId).toMatch(/^order-/);
  });

  test('shows a friendly error page (502) when session creation fails', async () => {
    const createSession: CreateSessionFn = async () => {
      throw new Error('CoffePay 401: Invalid API key');
    };
    const app = createApp({ createSession });

    const res = await request(app).post('/buy').redirects(0);

    expect(res.status).toBe(502);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Invalid API key');
    expect(res.text).toContain('Back to Store');
  });
});

describe('POST /webhooks/coffepay', () => {
  const body = JSON.stringify({
    event: 'payment.success',
    sessionId: 'sess-1',
    paymentId: 'pay-1',
    status: 'COMPLETED',
    amountMZN: '635.00',
  });

  test('valid signature → 200 and the event is recorded', async () => {
    const app = createApp({ createSession: noop });
    const signed = signPayload(body, SECRET());

    const res = await request(app)
      .post('/webhooks/coffepay')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, signed.header)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    // The recorded event is now visible on the return page.
    const ret = await request(app).get('/return?session=sess-1&status=COMPLETED');
    expect(ret.text).toContain('Payment Confirmed');
    expect(ret.text).toContain('635.00 MZN');
    expect(ret.text).toContain('signed CoffePay webhook');
  });

  test('invalid signature → 401, event not recorded', async () => {
    const app = createApp({ createSession: noop });

    const res = await request(app)
      .post('/webhooks/coffepay')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, 't=1700000000,v1=deadbeef')
      .send(body);

    expect(res.status).toBe(401);
  });

  test('tampered body fails verification (HMAC over raw body)', async () => {
    const app = createApp({ createSession: noop });
    const signed = signPayload(body, SECRET());
    const tampered = body.replace('635.00', '999.99');

    const res = await request(app)
      .post('/webhooks/coffepay')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, signed.header)
      .send(tampered);

    expect(res.status).toBe(401);
  });

  test('missing signature header → 401', async () => {
    const app = createApp({ createSession: noop });
    const res = await request(app)
      .post('/webhooks/coffepay')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });
});

describe('GET /return', () => {
  test('falls back to the query status when no webhook arrived yet', async () => {
    const app = createApp({ createSession: noop });
    const res = await request(app).get('/return?session=unknown&status=FAILED');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Payment failed');
    expect(res.text).toContain('redirect');
  });
});
