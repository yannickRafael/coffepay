import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const paymentEnvSchema = baseEnvSchema.extend({
  PAYMENT_SERVICE_PORT: z.coerce.number().int().positive().default(3002),
  PAYMENT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  PAYMENT_WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
});

export type PaymentConfig = z.infer<typeof paymentEnvSchema>;

let cached: PaymentConfig | undefined;
export function paymentConfig(): PaymentConfig {
  return (cached ??= loadEnv(paymentEnvSchema));
}
