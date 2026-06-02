import { prisma, NotFoundError, RiskLevel, PaymentStatus } from '@coffepay/shared';
import { reassessClient } from './kyc.monitor.js';

// Uses the lowered KYC_MONITOR_* thresholds from jest.setup.mjs:
// velocity MEDIUM=2/HIGH=3, cumulative MEDIUM=1000/HIGH=5000/BLACKLIST=10000.

let merchantId: string;
const clientIds: string[] = [];

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T18 Merchant', nuit: 'TST18000001', status: 'ACTIVE' },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Client', entityId: { in: clientIds } },
  });
  await prisma.merchant.delete({ where: { id: merchantId } }); // cascade sessions → payments
  await prisma.client.deleteMany({ where: { id: { in: clientIds } } }); // cascade profiles
  await prisma.$disconnect();
});

let seq = 0;
async function makeClient(riskLevel: RiskLevel = RiskLevel.LOW) {
  const client = await prisma.client.create({
    data: {
      phoneHash: `t18-hash-${seq++}-${Date.now()}`,
      kycProfile: { create: { riskLevel } },
    },
  });
  clientIds.push(client.id);
  return client.id;
}

async function makePayment(clientId: string, status: PaymentStatus, amountMZN: number) {
  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId: `t18-${seq++}`,
      amountUSD: '1.00',
      amountMZN: amountMZN.toFixed(2),
      callbackUrl: 'https://m.example/cb',
      status: 'COMPLETED',
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  await prisma.payment.create({
    data: {
      sessionId: session.id,
      clientId,
      idempotencyKey: `idem-${seq++}`,
      status,
    },
  });
}

describe('reassessClient', () => {
  test('quiet client stays LOW and writes no audit log', async () => {
    const clientId = await makeClient();
    await makePayment(clientId, PaymentStatus.SUCCESS, 500);

    const res = await reassessClient(clientId);
    expect(res.riskLevel).toBe(RiskLevel.LOW);
    expect(res.changed).toBe(false);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Client', entityId: clientId, action: 'KYC_RISK_UPDATED' },
    });
    expect(log).toBeNull();
  });

  test('velocity raises risk to HIGH and audits the change', async () => {
    const clientId = await makeClient();
    for (let i = 0; i < 3; i++) await makePayment(clientId, PaymentStatus.SUCCESS, 100);

    const res = await reassessClient(clientId);
    expect(res.riskLevel).toBe(RiskLevel.HIGH);
    expect(res.reasons).toContain('VELOCITY_HIGH');
    expect(res.changed).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Client', entityId: clientId, action: 'KYC_RISK_UPDATED' },
    });
    expect(log).not.toBeNull();
  });

  test('cumulative SUCCESS amount triggers sticky blacklist', async () => {
    const clientId = await makeClient();
    await makePayment(clientId, PaymentStatus.SUCCESS, 12000); // >= blacklist threshold

    const res = await reassessClient(clientId);
    expect(res.blacklisted).toBe(true);
    expect(res.reasons).toContain('CUMULATIVE_BLACKLIST');

    const profile = await prisma.kYCProfile.findUnique({ where: { clientId } });
    expect(profile?.isBlacklisted).toBe(true);
  });

  test('FAILED payments do not count toward the cumulative amount', async () => {
    const clientId = await makeClient();
    await makePayment(clientId, PaymentStatus.FAILED, 50000);

    const res = await reassessClient(clientId);
    // One failed payment: below failure min-samples and zero accumulated.
    expect(res.blacklisted).toBe(false);
    expect(res.reasons).not.toContain('CUMULATIVE_HIGH');
  });

  test('throws NotFoundError for an unknown client', async () => {
    await expect(reassessClient('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
