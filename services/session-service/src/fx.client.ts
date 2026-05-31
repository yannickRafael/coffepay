import axios from 'axios';
import { ProviderError } from '@coffepay/shared';
import { sessionConfig } from './config.js';

export interface Quote {
  fxRateId: string;
  rate: string;
  serviceFee: string;
  amountMZN: string;
  expiresAt: string;
}

/** Call the fx-service to quote an amount in USD → MZN. */
export async function fetchQuote(amountUSD: string | number): Promise<Quote> {
  const cfg = sessionConfig();
  try {
    const res = await axios.get(`${cfg.FX_SERVICE_URL}/fx/quote`, {
      params: { amount: amountUSD },
      timeout: cfg.FX_REQUEST_TIMEOUT_MS,
    });
    const d = res.data;
    return {
      fxRateId: d.fxRateId,
      rate: d.rate,
      serviceFee: d.serviceFee,
      amountMZN: d.amountMZN,
      expiresAt: d.expiresAt,
    };
  } catch (err) {
    throw new ProviderError('FX service unavailable', { reason: (err as Error).message });
  }
}

/** Function shape used by createSession; overridable in tests. */
export type QuoteFn = (amountUSD: string | number) => Promise<Quote>;
