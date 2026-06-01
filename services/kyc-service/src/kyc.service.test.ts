import { prisma, ValidationError, RiskLevel } from '@coffepay/shared';
import { evaluateKyc, resetBlacklistCache } from './kyc.service.js';
import { hashPhone } from './phone.js';

// Distinct test MSISDNs (258870000000 is blacklisted via jest.setup.mjs).
const PHONES = {
  normal: '258841000001',
  high: '258841000002',
  overLimit: '258841000003',
  blacklisted: '258870000000',
};

const hashes = Object.values(PHONES).map(hashPhone);

beforeAll(() => {
  resetBlacklistCache();
});

afterAll(async () => {
  const clients = await prisma.client.findMany({ where: { phoneHash: { in: hashes } } });
  const ids = clients.map((c) => c.id);
  await prisma.auditLog.deleteMany({ where: { entityType: 'Client', entityId: { in: ids } } });
  await prisma.client.deleteMany({ where: { phoneHash: { in: hashes } } }); // cascades profiles
  await prisma.$disconnect();
});

async function profileFor(phone: string) {
  const client = await prisma.client.findUnique({
    where: { phoneHash: hashPhone(phone) },
    include: { kycProfile: true },
  });
  return { client, profile: client?.kycProfile };
}

describe('evaluateKyc', () => {
  test('allows a normal client, creates Client + KYCProfile, audits', async () => {
    const res = await evaluateKyc({ phone: PHONES.normal, amountMZN: 5000 });
    expect(res.allowed).toBe(true);
    expect(res.riskLevel).toBe(RiskLevel.LOW);
    expect(res.reasons).toEqual([]);

    const { client, profile } = await profileFor(PHONES.normal);
    expect(client).not.toBeNull();
    expect(profile).toBeTruthy();
    expect(profile?.lastValidatedAt).toBeTruthy();

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Client', entityId: client!.id, action: 'KYC_VALIDATED' },
    });
    expect(log).not.toBeNull();
  });

  test('reuses the client and increments transactionCount on repeat (allowed)', async () => {
    const first = await evaluateKyc({ phone: PHONES.normal, amountMZN: 1000 });
    const second = await evaluateKyc({ phone: PHONES.normal, amountMZN: 1000 });
    expect(second.clientId).toBe(first.clientId);

    const { profile } = await profileFor(PHONES.normal);
    // 3 allowed validations so far for this phone (one in the previous test).
    expect(profile?.transactionCount).toBeGreaterThanOrEqual(2);
  });

  test('classifies a high amount as HIGH risk but still allows it', async () => {
    const res = await evaluateKyc({ phone: PHONES.high, amountMZN: 150000 });
    expect(res.allowed).toBe(true);
    expect(res.riskLevel).toBe(RiskLevel.HIGH);
  });

  test('rejects over the hard limit and does not increment transactionCount', async () => {
    const res = await evaluateKyc({ phone: PHONES.overLimit, amountMZN: 600000 });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toEqual(['AMOUNT_LIMIT_EXCEEDED']);

    const { profile } = await profileFor(PHONES.overLimit);
    expect(profile?.transactionCount).toBe(0);
  });

  test('blocks a config-blacklisted client', async () => {
    const res = await evaluateKyc({ phone: PHONES.blacklisted, amountMZN: 100 });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toEqual(['BLACKLISTED']);
    expect(res.riskLevel).toBe(RiskLevel.HIGH);
  });

  test('rejects an invalid MSISDN', async () => {
    await expect(evaluateKyc({ phone: '12345', amountMZN: 100 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
