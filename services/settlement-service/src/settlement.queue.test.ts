import { prisma, runSettlements } from '@coffepay/shared';
import { scheduleSettlement, startSettlementWorker, closeSettlement } from './settlement.queue.js';

let merchantId: string;
const phone = `set-svc-${Date.now()}`;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'SettleSvc', nuit: `SVC${Date.now()}`.slice(0, 14), status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: phone } });
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
      orderId: `svc-${Date.now()}`,
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
      idempotencyKey: `svc-${Date.now()}`,
      status: 'SUCCESS',
    },
  });
  await prisma.transaction.create({
    data: { paymentId: payment.id, amountMZN: '650.88', status: 'SUCCESS' },
  });
});

afterAll(async () => {
  await closeSettlement();
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.client.deleteMany({ where: { phoneHash: phone } });
  await prisma.$disconnect();
});

describe('settlement-service (T45)', () => {
  test('exports the worker/scheduler factories', () => {
    expect(typeof startSettlementWorker).toBe('function');
    expect(typeof scheduleSettlement).toBe('function');
  });

  test('runSettlements settles the seeded merchant', async () => {
    const results = await runSettlements();
    const mine = results.find((r) => r.merchantId === merchantId);
    expect(mine).toBeDefined();
    expect(mine!.transactionCount).toBeGreaterThanOrEqual(1);
    expect(mine!.amountUSD).toBe('10.00');
  });
});
