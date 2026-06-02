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

  // ---- Passive monitoring (RF13) ----
  KYC_MONITOR_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
  // How often the repeatable sweep runs (ms).
  KYC_MONITOR_INTERVAL_MS: z.coerce.number().int().positive().default(300000),
  // Behaviour window: payments newer than now - WINDOW are considered.
  KYC_MONITOR_WINDOW_MS: z.coerce.number().int().positive().default(86400000),
  // Velocity: payment count in the window.
  KYC_VELOCITY_MEDIUM: z.coerce.number().int().positive().default(5),
  KYC_VELOCITY_HIGH: z.coerce.number().int().positive().default(10),
  // Cumulative successful amount (MZN) in the window.
  KYC_CUMULATIVE_MEDIUM_MZN: z.coerce.number().positive().default(100000),
  KYC_CUMULATIVE_HIGH_MZN: z.coerce.number().positive().default(300000),
  // Above this cumulative the client is auto-blacklisted (anti-structuring).
  KYC_CUMULATIVE_BLACKLIST_MZN: z.coerce.number().positive().default(1000000),
  // Failure rate: needs at least MIN_SAMPLES payments before it can trip.
  KYC_FAILURE_MIN_SAMPLES: z.coerce.number().int().positive().default(5),
  KYC_FAILURE_RATE_HIGH: z.coerce.number().min(0).max(1).default(0.5),
});

export type KycConfig = z.infer<typeof kycEnvSchema>;

let cached: KycConfig | undefined;
export function kycConfig(): KycConfig {
  return (cached ??= loadEnv(kycEnvSchema));
}
