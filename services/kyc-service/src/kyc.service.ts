import { z } from 'zod';
import { prisma, writeAudit, ValidationError, type RiskLevel } from '@coffepay/shared';
import { kycConfig } from './config.js';
import { hashPhone, tryHashPhone } from './phone.js';
import { decide, type KycReason } from './kyc.rules.js';

export const evaluateKycSchema = z.object({
  phone: z.string().min(1),
  amountMZN: z.coerce.number().positive(),
});

export type EvaluateKycInput = z.infer<typeof evaluateKycSchema>;

export interface KycResult {
  clientId: string;
  allowed: boolean;
  riskLevel: RiskLevel;
  reasons: KycReason[];
}

let blacklistCache: Set<string> | undefined;
/** Hashed MSISDNs from KYC_BLACKLIST (config), parsed once. */
function configBlacklist(): Set<string> {
  if (!blacklistCache) {
    const hashes = kycConfig()
      .KYC_BLACKLIST.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(tryHashPhone)
      .filter((h): h is string => h !== null);
    blacklistCache = new Set(hashes);
  }
  return blacklistCache;
}

/**
 * Active KYC/AML validation (RF11, RF12). Resolves the client by phone hash,
 * ensures a KYC profile, applies the rule engine, persists the outcome and
 * audits it. Returns the decision; never stores the raw MSISDN.
 */
export async function evaluateKyc(input: EvaluateKycInput): Promise<KycResult> {
  const parsed = evaluateKycSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Invalid KYC payload', parsed.error.flatten());
  }
  const { phone, amountMZN } = parsed.data;
  const cfg = kycConfig();
  const phoneHash = hashPhone(phone); // throws ValidationError on bad MSISDN

  const client = await prisma.client.upsert({
    where: { phoneHash },
    create: { phoneHash, kycProfile: { create: {} } },
    update: {},
    include: { kycProfile: true },
  });

  const profile =
    client.kycProfile ?? (await prisma.kYCProfile.create({ data: { clientId: client.id } }));

  const isBlacklisted = profile.isBlacklisted || configBlacklist().has(phoneHash);
  const decision = decide({ amountMZN, isBlacklisted }, cfg);

  await prisma.kYCProfile.update({
    where: { id: profile.id },
    data: {
      riskLevel: decision.riskLevel,
      lastValidatedAt: new Date(),
      ...(decision.allowed ? { transactionCount: { increment: 1 } } : {}),
    },
  });

  await writeAudit({
    action: 'KYC_VALIDATED',
    entityType: 'Client',
    entityId: client.id,
    changes: {
      allowed: decision.allowed,
      riskLevel: decision.riskLevel,
      reasons: decision.reasons,
      amountMZN,
    },
  });

  return {
    clientId: client.id,
    allowed: decision.allowed,
    riskLevel: decision.riskLevel,
    reasons: decision.reasons,
  };
}

/** Test seam: reset the memoized blacklist (config re-read on next call). */
export function resetBlacklistCache(): void {
  blacklistCache = undefined;
}
