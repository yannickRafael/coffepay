import { prisma, ValidationError } from '@coffepay/shared';
import { createSession } from './session.service.js';
import { sessionConfig } from './config.js';
import type { Quote } from './fx.client.js';

const NUIT = 'TST15B0001';
let merchantId: string;

beforeAll(async () => {
  const merchant = await prisma.merchant.create({
    data: { name: 'T15b Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = merchant.id;
});

afterAll(async () => {
  // Cascade removes the merchant's sessions; clear orphan fx_rates + audit logs.
  await prisma.session.deleteMany({ where: { merchantId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

/** Create a real FXRate row and return a Quote pointing at it (satisfies the FK). */
async function makeQuote(amountUSD: number, rate = 63.5, spreadPct = 2.5): Promise<Quote> {
  const base = amountUSD * rate;
  const serviceFee = base * (spreadPct / 100);
  const amountMZN = base + serviceFee;
  const row = await prisma.fXRate.create({
    data: {
      fromCurrency: 'USD',
      toCurrency: 'MZN',
      rate: rate.toFixed(6),
      serviceFee: serviceFee.toFixed(2),
      expiresAt: new Date(Date.now() + 900_000),
    },
  });
  return {
    fxRateId: row.id,
    rate: rate.toString(),
    serviceFee: serviceFee.toFixed(2),
    amountMZN: amountMZN.toFixed(2),
    expiresAt: row.expiresAt.toISOString(),
  };
}

const validInput = {
  orderId: 'order-123',
  amountUSD: 100,
  callbackUrl: 'https://merchant.example/return',
};

describe('createSession', () => {
  test('persists a PENDING session and returns checkout details', async () => {
    const quote = await makeQuote(100);
    const result = await createSession(validInput, merchantId, async () => quote);

    expect(result.status).toBe('PENDING');
    expect(Number(result.amountUSD)).toBe(100);
    expect(Number(result.amountMZN)).toBe(Number(quote.amountMZN));
    expect(result.rate).toBe(quote.rate);
    expect(result.checkoutUrl).toContain(result.sessionId);

    const row = await prisma.session.findUnique({ where: { id: result.sessionId } });
    expect(row).not.toBeNull();
    expect(row?.merchantId).toBe(merchantId);
    expect(row?.status).toBe('PENDING');
    expect(row?.orderId).toBe('order-123');
  });

  test('links the FXRate snapshot to the session', async () => {
    const quote = await makeQuote(50);
    const result = await createSession(
      { ...validInput, amountUSD: 50 },
      merchantId,
      async () => quote,
    );

    const row = await prisma.session.findUnique({ where: { id: result.sessionId } });
    expect(row?.fxRateId).toBe(quote.fxRateId);
  });

  test('writes a SESSION_CREATED audit log', async () => {
    const quote = await makeQuote(25);
    const result = await createSession(
      { ...validInput, amountUSD: 25 },
      merchantId,
      async () => quote,
    );

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Session', entityId: result.sessionId, action: 'SESSION_CREATED' },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(merchantId);
  });

  test('calls the FX quote function with the USD amount', async () => {
    const quote = await makeQuote(100);
    const calls: Array<string | number> = [];
    const quoteFn = async (amount: string | number) => {
      calls.push(amount);
      return quote;
    };
    await createSession(validInput, merchantId, quoteFn);

    expect(calls).toEqual([100]);
  });

  test('propagates FX quote failures', async () => {
    const failing = async () => {
      throw new Error('fx down');
    };
    await expect(createSession(validInput, merchantId, failing)).rejects.toThrow('fx down');
  });
});

describe('expiry', () => {
  test('expiresAt is SESSION_TTL_SECONDS ahead of creation', async () => {
    const ttl = sessionConfig().SESSION_TTL_SECONDS;
    const quote = await makeQuote(100);
    const before = Date.now();
    const result = await createSession(validInput, merchantId, async () => quote);
    const after = Date.now();

    const expiresMs = new Date(result.expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + ttl * 1000 - 1000);
    expect(expiresMs).toBeLessThanOrEqual(after + ttl * 1000 + 1000);
  });
});

describe('validation', () => {
  test('rejects a negative amount', async () => {
    await expect(
      createSession({ ...validInput, amountUSD: -5 }, merchantId, async () => makeQuote(1)),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects a non-URL callback', async () => {
    await expect(
      createSession({ ...validInput, callbackUrl: 'not-a-url' }, merchantId, async () =>
        makeQuote(1),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('rejects an empty orderId', async () => {
    await expect(
      createSession({ ...validInput, orderId: '' }, merchantId, async () => makeQuote(1)),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
