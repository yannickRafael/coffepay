import { z } from 'zod';

/**
 * M-Pesa (Vodacom Moçambique OpenAPI) configuration. Credentials are optional:
 * when absent (or MPESA_MOCK=true) the client runs in mock mode — no network,
 * deterministic responses — so CI and credential-less dev still work.
 */
export const mpesaEnvSchema = z.object({
  MPESA_API_KEY: z.string().optional(),
  MPESA_PUBLIC_KEY: z.string().optional(),
  // Hostname only (no scheme, no port). Per-operation ports are added by the client.
  MPESA_API_HOST: z.string().default('api.sandbox.vm.co.mz'),
  // Origin header value registered on the Vodacom portal (required for real calls).
  MPESA_ORIGIN: z.string().default('developer.mpesa.vm.co.mz'),
  MPESA_SERVICE_PROVIDER_CODE: z.string().default('171717'),
  MPESA_CURRENCY: z.string().default('MZN'),
  MPESA_MOCK: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  MPESA_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

export type MpesaEnv = z.infer<typeof mpesaEnvSchema>;

export function loadMpesaConfig(source: NodeJS.ProcessEnv = process.env): MpesaEnv {
  return mpesaEnvSchema.parse(source);
}

/** Mock mode when explicitly enabled OR credentials are missing. */
export function isMockMode(cfg: MpesaEnv): boolean {
  return cfg.MPESA_MOCK === true || !cfg.MPESA_API_KEY || !cfg.MPESA_PUBLIC_KEY;
}
