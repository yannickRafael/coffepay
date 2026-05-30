import type { MpesaEnv } from './config.js';

/**
 * Vodacom Moçambique OpenAPI endpoints. Each operation lives on its own port
 * over the same host (ref: ivanruby/mpesa-mz-nodejs-lib).
 */
export const MPESA_PORTS = {
  c2b: 18352,
  query: 18353,
  reversal: 18354,
  b2c: 18345,
} as const;

const PATHS = {
  c2b: '/ipg/v1x/c2bPayment/singleStage/',
  query: '/ipg/v1x/queryTransactionStatus/',
  reversal: '/ipg/v1x/reversal/',
  b2c: '/ipg/v1x/b2cPayment/',
} as const;

export type MpesaOperation = keyof typeof MPESA_PORTS;

/** Build the full URL for an operation, e.g. https://host:18352/ipg/v1x/c2bPayment/singleStage/ */
export function mpesaUrl(cfg: MpesaEnv, op: MpesaOperation): string {
  return `https://${cfg.MPESA_API_HOST}:${MPESA_PORTS[op]}${PATHS[op]}`;
}
