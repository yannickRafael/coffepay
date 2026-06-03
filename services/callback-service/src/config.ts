import { z } from 'zod';
import { baseEnvSchema, loadEnv } from '@coffepay/shared';

const callbackEnvSchema = baseEnvSchema.extend({
  CALLBACK_SERVICE_PORT: z.coerce.number().int().positive().default(3003),
});

export type CallbackConfig = z.infer<typeof callbackEnvSchema>;

let cached: CallbackConfig | undefined;
export function callbackConfig(): CallbackConfig {
  return (cached ??= loadEnv(callbackEnvSchema));
}
