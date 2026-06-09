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
  product: {
    name: string;
    category: string;
    priceUSD: number;
    rating: number;
    reviews: number;
    description: string;
  };
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
    product: {
      name: 'Dell XPS 15 Laptop',
      category: 'Laptops',
      priceUSD: 299.99,
      rating: 4.5,
      reviews: 247,
      description:
        'The Dell XPS 15 delivers outstanding performance with a 13th Gen Intel Core i7, ' +
        'stunning 15.6" OLED display, and all-day battery life. Perfect for professionals ' +
        'and creatives who demand the best.',
    },
  };
  return cached;
}
