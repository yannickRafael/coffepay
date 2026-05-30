import { redis, prisma, ValidationError } from '@coffepay/shared';
import { quote, getLiveRate, refreshRate } from './fx.service.js';
import type { FxConfig } from './config.js';

const CACHE_KEY = 'fx:rate:USD:MZN';

// Empty provider URL forces the deterministic fallback rate (no network in tests).
const cfg = {
  FX_PROVIDER_URL: '',
  FX_SPREAD_PCT: 2.5,
  FX_FALLBACK_RATE: 63.5,
  FX_RATE_TTL_SECONDS: 900,
  FX_PROVIDER_TIMEOUT_MS: 5000,
} as unknown as FxConfig;

beforeEach(async () => {
  await redis.del(CACHE_KEY);
});

afterAll(async () => {
  await redis.quit();
  await prisma.$disconnect();
});

describe('fx convert', () => {
  test('applies rate and spread', async () => {
    const q = await quote(100, cfg);
    expect(q.rate).toBe('63.5');
    expect(q.serviceFee).toBe('158.75'); // 100*63.5*2.5%
    expect(q.amountMZN).toBe('6508.75'); // base 6350 + 158.75
    expect(q.fxRateId).toBeDefined();
  });

  test('persists an FXRate snapshot', async () => {
    const q = await quote(10, cfg);
    const row = await prisma.fXRate.findUnique({ where: { id: q.fxRateId } });
    expect(row).not.toBeNull();
    expect(row?.fromCurrency).toBe('USD');
    expect(row?.toCurrency).toBe('MZN');
  });

  test('rejects invalid amounts', async () => {
    await expect(quote('-5', cfg)).rejects.toBeInstanceOf(ValidationError);
    await expect(quote('abc', cfg)).rejects.toBeInstanceOf(ValidationError);
    await expect(quote(0, cfg)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('fx cache', () => {
  test('miss then hit', async () => {
    const a = await getLiveRate(cfg);
    expect(a.cached).toBe(false);
    expect(a.rate).toBe(63.5);

    const b = await getLiveRate(cfg);
    expect(b.cached).toBe(true);
    expect(b.rate).toBe(63.5);
  });

  test('refresh overwrites; next read is a hit', async () => {
    await getLiveRate(cfg);
    const r = await refreshRate(cfg);
    expect(r).toBe(63.5);
    const after = await getLiveRate(cfg);
    expect(after.cached).toBe(true);
  });

  test('expiry (key gone) → miss again', async () => {
    await getLiveRate(cfg);
    await redis.del(CACHE_KEY); // simulate TTL expiry
    const again = await getLiveRate(cfg);
    expect(again.cached).toBe(false);
  });
});
