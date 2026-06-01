import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const kycEnvSchema = baseEnvSchema.extend({
  KYC_SERVICE_PORT: z.coerce.number().int().positive().default(3004),
  // Hard single-transaction ceiling (MZN); above it the payment is rejected.
  KYC_MAX_AMOUNT_MZN: z.coerce.number().positive().default(500000),
  // Risk thresholds (MZN). amount >= HIGH → HIGH, >= MEDIUM → MEDIUM, else LOW.
  KYC_HIGH_RISK_AMOUNT_MZN: z.coerce.number().positive().default(100000),
  KYC_MEDIUM_RISK_AMOUNT_MZN: z.coerce.number().positive().default(25000),
  // Mock sanctions list: CSV of MSISDNs (any accepted format, normalized on load).
  KYC_BLACKLIST: z.string().default(''),
});

export type KycConfig = z.infer<typeof kycEnvSchema>;

let cached: KycConfig | undefined;
export function kycConfig(): KycConfig {
  return (cached ??= loadEnv(kycEnvSchema));
}
