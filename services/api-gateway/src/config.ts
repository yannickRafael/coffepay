import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const gatewayEnvSchema = baseEnvSchema.extend({
  API_GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  JSON_LIMIT: z.string().default('1mb'),
  CORS_ORIGIN: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  JWT_EXPIRES_IN: z.string().default('15m'),
  MERCHANT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  MERCHANT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  SESSION_SERVICE_URL: z.string().default('http://localhost:3001'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  // Admin key for operational endpoints (DLQ inspect/reprocess — T34). When
  // unset, the admin routes reject every request (no open admin surface).
  ADMIN_API_KEY: z.string().optional(),
});

export type GatewayConfig = z.infer<typeof gatewayEnvSchema>;

let cached: GatewayConfig | undefined;
export function gatewayConfig(): GatewayConfig {
  return (cached ??= loadEnv(gatewayEnvSchema));
}
