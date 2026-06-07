import { ProviderError, TimeoutError } from '../errors.js';
import { createLogger } from '../logger.js';

const log = createLogger({ module: 'mpesa-resilience' });

/** Tunables for retry + circuit breaker (from MpesaEnv). */
export interface ResilienceOptions {
  maxAttempts: number;
  baseDelayMs: number;
  failureThreshold: number;
  cooldownMs: number;
}

/** Injectable clock/sleep so tests run without real timers. */
export interface ResilienceDeps {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Deterministic jitter factor in [0,1); defaults to Math.random. */
  random?: () => number;
}

type BreakerPhase = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerState {
  failures: number;
  phase: BreakerPhase;
  openedAt: number;
}

// One breaker per operation key (e.g. "c2bPayment"). Module-level so it persists
// across calls within a process.
const breakers = new Map<string, BreakerState>();

function getBreaker(key: string): BreakerState {
  let b = breakers.get(key);
  if (!b) {
    b = { failures: 0, phase: 'CLOSED', openedAt: 0 };
    breakers.set(key, b);
  }
  return b;
}

/** Test helper: clear all breaker state. */
export function resetBreakers(): void {
  breakers.clear();
}

/**
 * Classify whether an error is worth retrying. Only transient infrastructure
 * failures are: timeouts, network errors and HTTP 5xx. Business/validation
 * errors (4xx, invalid MSISDN, declines) must NOT be retried.
 */
export function isTransient(err: unknown): boolean {
  if (err instanceof TimeoutError) return true;
  if (err instanceof ProviderError) {
    const d = (err.details ?? {}) as { status?: number; netCode?: string };
    if (typeof d.status === 'number') return d.status >= 500;
    const transientNet = new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'EPIPE',
      'ETIMEDOUT',
      'ECONNABORTED',
    ]);
    if (d.netCode && transientNet.has(d.netCode)) return true;
    // ProviderError with no HTTP status and no known net code: treat as transient
    // (e.g. TLS/connection-level failure) so the provider gets a brief retry.
    return d.status === undefined;
  }
  return false;
}

/**
 * Run an HTTP operation with retry (exponential backoff + jitter) and a
 * per-operation circuit breaker (RNF04). When the breaker is OPEN, fails fast
 * without calling the network; after a cooldown it goes HALF_OPEN and allows a
 * single trial that either closes it (success) or re-opens it (failure).
 */
export async function withResilience<T>(
  key: string,
  fn: () => Promise<T>,
  opts: ResilienceOptions,
  deps: ResilienceDeps = {},
): Promise<T> {
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const b = getBreaker(key);

  // Breaker gate.
  if (b.phase === 'OPEN') {
    if (now() - b.openedAt >= opts.cooldownMs) {
      b.phase = 'HALF_OPEN';
      log.info({ op: key }, 'circuit half-open: allowing trial');
    } else {
      throw new ProviderError(`M-Pesa ${key} circuit open`, { circuit: 'OPEN' });
    }
  }

  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const result = await fn();
      // Success closes the breaker.
      b.failures = 0;
      b.phase = 'CLOSED';
      b.openedAt = 0;
      return result;
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);
      if (!transient) throw err; // business/validation error: do not retry

      b.failures += 1;
      if (b.phase === 'HALF_OPEN' || b.failures >= opts.failureThreshold) {
        b.phase = 'OPEN';
        b.openedAt = now();
        log.warn({ op: key, failures: b.failures }, 'circuit opened');
        throw err; // stop retrying once the breaker trips
      }

      if (attempt < opts.maxAttempts) {
        const base = opts.baseDelayMs * 2 ** (attempt - 1);
        const delay = base + random() * base * 0.2; // up to 20% jitter
        log.info({ op: key, attempt, delay }, 'transient error: retrying');
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}
