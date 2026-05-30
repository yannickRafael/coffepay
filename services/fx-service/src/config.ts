import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const fxEnvSchema = baseEnvSchema.extend({
  FX_SERVICE_PORT: z.coerce.number().int().positive().default(3005),
  // External provider returning { rates: { MZN: <number> } } for base USD.
  FX_PROVIDER_URL: z.string().default('https://open.er-api.com/v6/latest/USD'),
  FX_RATE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  FX_SPREAD_PCT: z.coerce.number().nonnegative().default(2.5),
  // Used when the provider is unreachable or FX_PROVIDER_URL is empty.
  FX_FALLBACK_RATE: z.coerce.number().positive().default(63.5),
  FX_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
});

export type FxConfig = z.infer<typeof fxEnvSchema>;

let cached: FxConfig | undefined;
export function fxConfig(): FxConfig {
  return (cached ??= loadEnv(fxEnvSchema));
}
