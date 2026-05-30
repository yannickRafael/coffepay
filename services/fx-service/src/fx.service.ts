import axios from 'axios';
import { Prisma, prisma, redis, createLogger, ValidationError } from '@coffepay/shared';
import { fxConfig, type FxConfig } from './config.js';

const log = createLogger({ service: 'fx-service' });

const FROM = 'USD';
const TO = 'MZN';
const CACHE_KEY = `fx:rate:${FROM}:${TO}`;

const Decimal = Prisma.Decimal;

interface CachedRate {
  rate: number;
  fetchedAt: string;
}

/** Fetch the live USD→MZN rate from the provider; fall back to a fixed rate. */
async function fetchProviderRate(cfg: FxConfig): Promise<number> {
  if (!cfg.FX_PROVIDER_URL) return cfg.FX_FALLBACK_RATE;
  try {
    const res = await axios.get(cfg.FX_PROVIDER_URL, { timeout: cfg.FX_PROVIDER_TIMEOUT_MS });
    const rate = res.data?.rates?.[TO];
    if (typeof rate !== 'number' || !(rate > 0)) throw new Error(`no ${TO} rate in response`);
    return rate;
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'FX provider failed; using fallback rate');
    return cfg.FX_FALLBACK_RATE;
  }
}

/** Get the current rate, preferring the Redis cache (TTL); fetch+cache on miss. */
export async function getLiveRate(
  cfg: FxConfig = fxConfig(),
): Promise<{ rate: number; cached: boolean }> {
  const hit = await redis.get(CACHE_KEY);
  if (hit) {
    const parsed = JSON.parse(hit) as CachedRate;
    return { rate: parsed.rate, cached: true };
  }
  const rate = await fetchProviderRate(cfg);
  const value: CachedRate = { rate, fetchedAt: new Date().toISOString() };
  await redis.set(CACHE_KEY, JSON.stringify(value), 'EX', cfg.FX_RATE_TTL_SECONDS);
  return { rate, cached: false };
}

/** Force a refresh from the provider, overwriting the cache. */
export async function refreshRate(cfg: FxConfig = fxConfig()): Promise<number> {
  const rate = await fetchProviderRate(cfg);
  const value: CachedRate = { rate, fetchedAt: new Date().toISOString() };
  await redis.set(CACHE_KEY, JSON.stringify(value), 'EX', cfg.FX_RATE_TTL_SECONDS);
  return rate;
}

export interface Quote {
  fxRateId: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  serviceFee: string;
  amountUSD: string;
  amountMZN: string;
  expiresAt: string;
  cached: boolean;
}

/**
 * Convert amountUSD → MZN: amountMZN = amountUSD*rate + serviceFee, where
 * serviceFee = base*spread%. Persists an immutable FXRate snapshot row.
 */
export async function quote(
  amountUSD: string | number,
  cfg: FxConfig = fxConfig(),
): Promise<Quote> {
  let amount: InstanceType<typeof Decimal>;
  try {
    amount = new Decimal(amountUSD);
  } catch {
    throw new ValidationError('amount must be a number', { amount: String(amountUSD) });
  }
  if (!amount.isFinite() || amount.lte(0)) {
    throw new ValidationError('amount must be a positive number', { amount: String(amountUSD) });
  }

  const { rate, cached } = await getLiveRate(cfg);
  const rateD = new Decimal(rate);
  const base = amount.mul(rateD);
  const serviceFee = base.mul(new Decimal(cfg.FX_SPREAD_PCT)).div(100);
  const amountMZN = base.add(serviceFee);
  const expiresAt = new Date(Date.now() + cfg.FX_RATE_TTL_SECONDS * 1000);

  const row = await prisma.fXRate.create({
    data: {
      fromCurrency: FROM,
      toCurrency: TO,
      rate: rateD,
      serviceFee: serviceFee.toDecimalPlaces(2),
      expiresAt,
    },
  });

  return {
    fxRateId: row.id,
    fromCurrency: FROM,
    toCurrency: TO,
    rate: rateD.toString(),
    serviceFee: serviceFee.toFixed(2),
    amountUSD: amount.toFixed(2),
    amountMZN: amountMZN.toFixed(2),
    expiresAt: expiresAt.toISOString(),
    cached,
  };
}
