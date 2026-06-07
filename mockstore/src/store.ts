import { mockstoreConfig } from './config.js';

export interface CreateSessionResult {
  checkoutUrl: string;
  sessionId?: string;
}

/** Injectable CoffePay client so /buy can be tested without the gateway. */
export type CreateSessionFn = (input: {
  orderId: string;
  amountUSD: number;
  callbackUrl: string;
}) => Promise<CreateSessionResult>;

/**
 * Default client: POST to the CoffePay gateway /api/v1/sessions/create with the
 * merchant API key (T14). Throws on non-2xx so the route shows an error page.
 */
export const createCoffepaySession: CreateSessionFn = async (input) => {
  const cfg = mockstoreConfig();
  const res = await fetch(`${cfg.gatewayUrl}/api/v1/sessions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CoffePay ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as CreateSessionResult;
};
