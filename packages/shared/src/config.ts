import { z } from 'zod';

/**
 * Common environment variables shared by all services. Each service composes
 * its own schema by extending this one and passing it to loadEnv().
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SERVICE_NAME: z.string().optional(),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(1),
  WEBHOOK_SIGNING_SECRET: z.string().min(1),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Validate process.env against a Zod schema. Throws a readable error listing
 * every invalid/missing variable so the process fails fast at startup.
 */
export function loadEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
