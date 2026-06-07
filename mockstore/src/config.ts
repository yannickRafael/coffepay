/** Minimal standalone config for the demo store (not a CoffePay service). */
export interface MockstoreConfig {
  port: number;
  /** CoffePay API gateway base URL (T14). */
  gatewayUrl: string;
  /** Demo merchant API key (seeded — see prisma/seed.ts). */
  apiKey: string;
  /** Public base URL of this store, used to build the callback/return URL. */
  publicBaseUrl: string;
  /** Shared HMAC secret to verify incoming CoffePay webhooks (T25/T28). */
  webhookSecret: string;
  /** Demo product. */
  product: { name: string; priceUSD: number };
}

let cached: MockstoreConfig | undefined;

export function mockstoreConfig(): MockstoreConfig {
  if (cached) return cached;
  const port = Number(process.env.MOCKSTORE_PORT ?? 4000);
  cached = {
    port,
    gatewayUrl: process.env.COFFEPAY_API_URL ?? process.env.GATEWAY_URL ?? 'http://localhost:3000',
    apiKey: process.env.MOCKSTORE_API_KEY ?? 'cp_dev_sk_demo_0001',
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`,
    webhookSecret:
      process.env.MOCKSTORE_WEBHOOK_SECRET ??
      process.env.WEBHOOK_SIGNING_SECRET ??
      'dev-webhook-secret',
    product: { name: 'CoffePay Demo Mug', priceUSD: 10 },
  };
  return cached;
}
