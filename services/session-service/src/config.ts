import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const sessionEnvSchema = baseEnvSchema.extend({
  SESSION_SERVICE_PORT: z.coerce.number().int().positive().default(3001),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  FX_SERVICE_URL: z.string().default('http://localhost:3005'),
  CHECKOUT_BASE_URL: z.string().default('http://localhost:3001'),
  FX_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  SESSION_EXPIRY_SWEEP_MS: z.coerce.number().int().positive().default(60000),
  KYC_SERVICE_URL: z.string().default('http://localhost:3004'),
  KYC_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
});

export type SessionConfig = z.infer<typeof sessionEnvSchema>;

let cached: SessionConfig | undefined;
export function sessionConfig(): SessionConfig {
  return (cached ??= loadEnv(sessionEnvSchema));
}
