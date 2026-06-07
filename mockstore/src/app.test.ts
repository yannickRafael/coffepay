import request from 'supertest';
import { createApp } from './app.js';
import type { CreateSessionFn } from './store.js';

describe('GET /', () => {
  test('renders the product page with a Pay with CoffePay button', async () => {
    const app = createApp({ createSession: async () => ({ checkoutUrl: 'x' }) });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Pay with CoffePay');
    expect(res.text).toContain('USD');
    expect(res.text).toContain('action="/buy"');
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
    expect(calls[0]!.amountUSD).toBe(10);
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
    expect(res.text).toContain('Voltar à loja');
  });
});
