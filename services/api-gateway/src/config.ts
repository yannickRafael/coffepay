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
});

export type GatewayConfig = z.infer<typeof gatewayEnvSchema>;

let cached: GatewayConfig | undefined;
export function gatewayConfig(): GatewayConfig {
  return (cached ??= loadEnv(gatewayEnvSchema));
}
