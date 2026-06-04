import {
  prisma,
  processResult,
  PaymentStatus,
  SessionStatus,
  type MpesaResult,
  type ResultRequestContext,
} from '@coffepay/shared';

let merchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T24 Merchant', nuit: 'TST24000001', status: 'ACTIVE' },
  });
  merchantId = m.id;
  const c = await prisma.client.create({ data: { phoneHash: `t24-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makePayment(amountMZN: string) {
  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId: `t24-${seq++}`,
      amountUSD: '10.00',
      amountMZN,
      callbackUrl: 'https://m.example/cb',
      status: SessionStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return prisma.payment.create({
    data: {
      sessionId: session.id,
      clientId,
      idempotencyKey: `k-${seq++}`,
      status: PaymentStatus.PENDING,
    },
  });
}

const TPR = 'TPR-T24';
const request: ResultRequestContext = {
  amount: '0',
  msisdn: '258841234567',
  reference: 'ref',
  thirdPartyReference: TPR,
};
const ok: MpesaResult = {
  success: true,
  code: 'INS-0',
  thirdPartyReference: TPR,
  raw: { output_ResponseCode: 'INS-0', output_ThirdPartyReference: TPR },
};
const declined: MpesaResult = {
  success: false,
  code: 'INS-996',
  thirdPartyReference: TPR,
  raw: { output_ResponseCode: 'INS-996', output_ThirdPartyReference: TPR },
};
const notify = async () => undefined;

describe('ledger (RF21)', () => {
  test('successful payment records a DEBIT and a CREDIT plus an audit', async () => {
    const p = await makePayment('635.00');
    await processResult({ paymentId: p.id, result: ok, request }, { notify });

    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    const entries = await prisma.ledgerEntry.findMany({
      where: { transactionId: tx!.id },
      orderBy: { entryType: 'asc' },
    });
    expect(entries).toHaveLength(2);
    const credit = entries.find((e) => e.entryType === 'CREDIT');
    const debit = entries.find((e) => e.entryType === 'DEBIT');
    expect(Number(credit?.amount)).toBe(635);
    expect(Number(debit?.amount)).toBe(635);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Transaction', entityId: tx!.id, action: 'LEDGER_RECORDED' },
    });
    expect(audit).not.toBeNull();
  });

  test('CREDIT balanceAfter accumulates across the merchant payments', async () => {
    const p = await makePayment('100.00');
    await processResult({ paymentId: p.id, result: ok, request }, { notify });
    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    const credit = await prisma.ledgerEntry.findFirst({
      where: { transactionId: tx!.id, entryType: 'CREDIT' },
    });
    // 635 (first test) + 100 = 735 running merchant payable.
    expect(Number(credit?.balanceAfter)).toBe(735);
  });

  test('declined payment records no ledger entries', async () => {
    const p = await makePayment('50.00');
    await processResult({ paymentId: p.id, result: declined, request }, { notify });
    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    expect(await prisma.ledgerEntry.count({ where: { transactionId: tx!.id } })).toBe(0);
  });
});
