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
  // Payment confirmation timeout (RF08): a PROCESSING session whose payment is
  // not confirmed within this window is failed.
  PAYMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  PAYMENT_TIMEOUT_SWEEP_MS: z.coerce.number().int().positive().default(30000),
  // Client-side checkout polling (T30): how often to poll GET /sessions/:id and
  // when to give up. Timeout should be >= PAYMENT_TIMEOUT_MS so the server-side
  // sweep (RF08) can mark the session FAILED before the client stops polling.
  CHECKOUT_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),
  CHECKOUT_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(150000),
});

export type SessionConfig = z.infer<typeof sessionEnvSchema>;

let cached: SessionConfig | undefined;
export function sessionConfig(): SessionConfig {
  return (cached ??= loadEnv(sessionEnvSchema));
}
