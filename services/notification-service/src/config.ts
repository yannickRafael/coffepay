import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const notificationEnvSchema = baseEnvSchema.extend({
  NOTIFY_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
  NOTIFY_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  NOTIFY_WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),
});

export type NotificationConfig = z.infer<typeof notificationEnvSchema>;

let cached: NotificationConfig | undefined;
export function notificationConfig(): NotificationConfig {
  return (cached ??= loadEnv(notificationEnvSchema));
}
