import {
  prisma,
  processResult,
  NotFoundError,
  ValidationError,
  PaymentStatus,
  TransactionStatus,
  SessionStatus,
  type MpesaResult,
  type ResultRequestContext,
} from '@coffepay/shared';

// Merchant WITH a webhook (notifications) and one WITHOUT (no-op notify).
let merchantId: string;
let noHookMerchantId: string;
let clientId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: {
      name: 'T23b Merchant',
      nuit: 'TST23B00001',
      status: 'ACTIVE',
      webhooks: {
        create: { url: 'https://m.example/hook', events: 'payment.success,payment.failed' },
      },
    },
  });
  merchantId = m.id;
  const m2 = await prisma.merchant.create({
    data: { name: 'T23b NoHook', nuit: 'TST23B00002', status: 'ACTIVE' },
  });
  noHookMerchantId = m2.id;
  const c = await prisma.client.create({ data: { phoneHash: `t23b-${Date.now()}` } });
  clientId = c.id;
});

afterAll(async () => {
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.merchant.delete({ where: { id: noHookMerchantId } });
  await prisma.client.delete({ where: { id: clientId } });
  await prisma.$disconnect();
});

let seq = 0;
async function makePayment(
  merchant = merchantId,
  paymentStatus: PaymentStatus = PaymentStatus.PENDING,
) {
  const session = await prisma.session.create({
    data: {
      merchantId: merchant,
      orderId: `t23b-${seq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status: SessionStatus.PROCESSING,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return prisma.payment.create({
    data: { sessionId: session.id, clientId, idempotencyKey: `k-${seq++}`, status: paymentStatus },
  });
}

const TPR = 'TPR-T23B';
const request: ResultRequestContext = {
  amount: '635.00',
  msisdn: '258841234567',
  reference: 'ref',
  thirdPartyReference: TPR,
};
const ok = (tpr = TPR): MpesaResult => ({
  success: true,
  code: 'INS-0',
  thirdPartyReference: tpr,
  raw: { output_ResponseCode: 'INS-0', output_ThirdPartyReference: tpr },
});
const declined = (tpr = TPR): MpesaResult => ({
  success: false,
  code: 'INS-996',
  thirdPartyReference: tpr,
  raw: { output_ResponseCode: 'INS-996', output_ThirdPartyReference: tpr },
});

function notifyCollector() {
  const calls: Array<{ event: string }> = [];
  return { calls, notify: async (j: { event: string }) => void calls.push(j) };
}

describe('processResult — success', () => {
  test('maps to SUCCESS/COMPLETED, audits and notifies', async () => {
    const p = await makePayment();
    const { calls, notify } = notifyCollector();
    const out = await processResult({ paymentId: p.id, result: ok(), request }, { notify });

    expect(out.status).toBe(PaymentStatus.SUCCESS);
    expect(out.sessionStatus).toBe(SessionStatus.COMPLETED);
    expect(out.notified).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.event).toBe('payment.success');

    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    expect(tx?.status).toBe(TransactionStatus.SUCCESS);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Payment', entityId: p.id, action: 'PAYMENT_RESULT_PROCESSED' },
    });
    expect(audit).not.toBeNull();
  });
});

describe('processResult — declined', () => {
  test('maps to FAILED/FAILED and notifies payment.failed', async () => {
    const p = await makePayment();
    const { calls, notify } = notifyCollector();
    const out = await processResult({ paymentId: p.id, result: declined(), request }, { notify });

    expect(out.status).toBe(PaymentStatus.FAILED);
    expect(out.sessionStatus).toBe(SessionStatus.FAILED);
    expect(calls[0]?.event).toBe('payment.failed');
    const tx = await prisma.transaction.findUnique({ where: { paymentId: p.id } });
    expect(tx?.confirmedAt).toBeNull();
  });
});

describe('processResult — authenticity (RF10)', () => {
  test('rejects a third-party reference mismatch, leaving state unchanged', async () => {
    const p = await makePayment();
    const { calls, notify } = notifyCollector();
    await expect(
      processResult({ paymentId: p.id, result: ok('WRONG'), request }, { notify }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(calls).toHaveLength(0);
    expect((await prisma.payment.findUnique({ where: { id: p.id } }))?.status).toBe(
      PaymentStatus.PENDING,
    );
  });
});

describe('processResult — idempotency & guards', () => {
  test('a terminal payment is not reprocessed or re-notified', async () => {
    const p = await makePayment(merchantId, PaymentStatus.SUCCESS);
    const { calls, notify } = notifyCollector();
    const out = await processResult({ paymentId: p.id, result: ok(), request }, { notify });
    expect(out.idempotent).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test('unknown payment → NotFoundError', async () => {
    await expect(
      processResult({ paymentId: '00000000-0000-0000-0000-000000000000', result: ok(), request }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('merchant without an active webhook → notified false', async () => {
    const p = await makePayment(noHookMerchantId);
    const { calls, notify } = notifyCollector();
    const out = await processResult({ paymentId: p.id, result: ok(), request }, { notify });
    expect(out.notified).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
