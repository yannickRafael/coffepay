import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const settlementEnvSchema = baseEnvSchema.extend({
  // How often the periodic settlement sweep runs (default 1h).
  SETTLEMENT_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
  SETTLEMENT_WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
});

export type SettlementConfig = z.infer<typeof settlementEnvSchema>;

let cached: SettlementConfig | undefined;
export function settlementConfig(): SettlementConfig {
  return (cached ??= loadEnv(settlementEnvSchema));
}
