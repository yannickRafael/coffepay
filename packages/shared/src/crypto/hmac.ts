import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'X-CoffePay-Signature';
const DEFAULT_TOLERANCE_SEC = 300;

function canonicalBody(payload: string | object): string {
  return typeof payload === 'string' ? payload : JSON.stringify(payload);
}

/** HMAC-SHA256 of `${timestamp}.${body}`, hex. */
function computeSignature(body: string, secret: string, timestamp: number): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export interface SignedWebhook {
  timestamp: number;
  signature: string;
  /** Value for the SIGNATURE_HEADER header, e.g. "t=1700000000,v1=abc…". */
  header: string;
}

/** Sign a webhook payload. Stripe-style scheme to bind the timestamp (anti-replay). */
export function signPayload(
  payload: string | object,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): SignedWebhook {
  const signature = computeSignature(canonicalBody(payload), secret, timestamp);
  return { timestamp, signature, header: `t=${timestamp},v1=${signature}` };
}

/** Parse a "t=…,v1=…" header into its parts. */
export function parseSignatureHeader(header: string): { t?: number; v1?: string } {
  const out: { t?: number; v1?: string } = {};
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k?.trim() === 't') out.t = Number.parseInt(v ?? '', 10);
    else if (k?.trim() === 'v1') out.v1 = v?.trim();
  }
  return out;
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export interface VerifyOptions {
  toleranceSec?: number;
  now?: number;
}

/**
 * Verify a webhook signature header against the raw payload.
 * Rejects tampered bodies (HMAC mismatch) and stale timestamps (replay).
 */
export function verifySignature(
  payload: string | object,
  header: string,
  secret: string,
  opts: VerifyOptions = {},
): boolean {
  const { t, v1 } = parseSignatureHeader(header);
  if (!t || !v1 || Number.isNaN(t)) return false;

  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > tolerance) return false;

  const expected = computeSignature(canonicalBody(payload), secret, t);
  return safeEqualHex(expected, v1);
}
