import { prisma } from './db.js';
import { settleMerchant, runSettlements } from './settlement.js';

let merchantId: string;
let otherMerchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T44 Merchant', nuit: `T44${Date.now()}`.slice(0, 14), status: 'ACTIVE' },
  });
  merchantId = m.id;
  const m2 = await prisma.merchant.create({
    data: { name: 'T44 Other', nuit: `T44B${Date.now()}`.slice(0, 14), status: 'ACTIVE' },
  });
  otherMerchantId = m2.id;
  const c = await prisma.client.create({ data: { phoneHash: `t44-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade
  await prisma.merchant.delete({ where: { id: otherMerchantId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
/** Build a confirmed (SUCCESS) transaction for a merchant. */
async function confirmedTxn(merchant: string, amountUSD = '10.00', serviceFee = '15.88') {
  const rate = await prisma.fXRate.create({
    data: {
      fromCurrency: 'USD',
      toCurrency: 'MZN',
      rate: '63.500000',
      serviceFee,
      expiresAt: new Date(Date.now() + 900_000),
    },
  });
  const grossMZN = (Number(amountUSD) * 63.5 + Number(serviceFee)).toFixed(2);
  const session = await prisma.session.create({
    data: {
      merchantId: merchant,
      orderId: `t44-${seq++}`,
      amountUSD,
      amountMZN: grossMZN,
      callbackUrl: 'https://m.example/cb',
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() + 60_000),
      fxRateId: rate.id,
    },
  });
  const payment = await prisma.payment.create({
    data: { sessionId: session.id, clientId, idempotencyKey: `t44-${seq++}`, status: 'SUCCESS' },
  });
  return prisma.transaction.create({
    data: { paymentId: payment.id, amountMZN: grossMZN, status: 'SUCCESS' },
  });
}

describe('settleMerchant (T44)', () => {
  test('aggregates confirmed txns, deducts fees, derives net USD, marks them', async () => {
    const t1 = await confirmedTxn(merchantId);
    const t2 = await confirmedTxn(merchantId);

    const res = await settleMerchant(merchantId);
    expect(res).not.toBeNull();
    expect(res!.transactionCount).toBe(2);
    // gross 650.88*2 = 1301.76, fees 15.88*2 = 31.76 → net 1270.00; USD 20.00.
    expect(res!.feesDeducted).toBe('31.76');
    expect(res!.amountMZN).toBe('1270.00');
    expect(res!.amountUSD).toBe('20.00');

    // Transactions are now linked to the settlement.
    const marked = await prisma.transaction.findMany({
      where: { id: { in: [t1.id, t2.id] } },
      select: { settlementId: true },
    });
    expect(marked.every((m) => m.settlementId === res!.settlementId)).toBe(true);

    // Settlement persisted with COMPLETED status.
    const s = await prisma.settlement.findUnique({ where: { id: res!.settlementId } });
    expect(s?.status).toBe('COMPLETED');

    // Audited.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'SETTLEMENT_PROCESSED', entityId: res!.settlementId },
    });
    expect(audit).not.toBeNull();
  });

  test('idempotent: nothing left to settle → null, no duplicate', async () => {
    await confirmedTxn(merchantId);
    const first = await settleMerchant(merchantId);
    expect(first).not.toBeNull();
    const second = await settleMerchant(merchantId);
    expect(second).toBeNull(); // already settled
  });

  test('does not touch another merchant transactions', async () => {
    await confirmedTxn(merchantId);
    const mine = await confirmedTxn(otherMerchantId);
    const res = await settleMerchant(otherMerchantId);
    expect(res!.transactionCount).toBe(1);
    const t = await prisma.transaction.findUnique({ where: { id: mine.id } });
    expect(t?.settlementId).toBe(res!.settlementId);
  });

  test('runSettlements settles all merchants with pending transactions', async () => {
    await confirmedTxn(merchantId);
    await confirmedTxn(otherMerchantId);
    const all = await runSettlements();
    // At least the two merchants under test are covered.
    const ids = all.map((r) => r.merchantId);
    expect(ids).toEqual(expect.arrayContaining([merchantId, otherMerchantId]));
  });
});
