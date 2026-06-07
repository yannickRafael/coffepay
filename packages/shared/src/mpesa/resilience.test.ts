import { ProviderError, TimeoutError, ValidationError } from '../errors.js';
import {
  withResilience,
  isTransient,
  resetBreakers,
  type ResilienceOptions,
  type ResilienceDeps,
} from './resilience.js';

const OPTS: ResilienceOptions = {
  maxAttempts: 3,
  baseDelayMs: 10,
  failureThreshold: 3,
  cooldownMs: 1000,
};

// No real waiting; deterministic jitter.
const fastDeps = (now: () => number = () => 0): ResilienceDeps => ({
  now,
  sleep: async () => {},
  random: () => 0,
});

beforeEach(() => resetBreakers());

function transientErr() {
  return new ProviderError('boom', { netCode: 'ECONNRESET' });
}

describe('isTransient', () => {
  test('timeouts, 5xx and network errors are transient', () => {
    expect(isTransient(new TimeoutError('t'))).toBe(true);
    expect(isTransient(new ProviderError('e', { status: 503 }))).toBe(true);
    expect(isTransient(new ProviderError('e', { netCode: 'ECONNREFUSED' }))).toBe(true);
  });

  test('4xx and validation errors are not transient', () => {
    expect(isTransient(new ProviderError('e', { status: 400 }))).toBe(false);
    expect(isTransient(new ValidationError('bad'))).toBe(false);
    expect(isTransient(new Error('plain'))).toBe(false);
  });
});

describe('withResilience retry', () => {
  test('returns on first success without retrying', async () => {
    let calls = 0;
    const out = await withResilience(
      'op',
      async () => {
        calls++;
        return 'ok';
      },
      OPTS,
      fastDeps(),
    );
    expect(out).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries a transient error then succeeds', async () => {
    let calls = 0;
    const out = await withResilience(
      'op',
      async () => {
        calls++;
        if (calls < 2) throw transientErr();
        return 'ok';
      },
      OPTS,
      fastDeps(),
    );
    expect(out).toBe('ok');
    expect(calls).toBe(2);
  });

  test('does not retry a business/validation error', async () => {
    let calls = 0;
    await expect(
      withResilience(
        'op',
        async () => {
          calls++;
          throw new ProviderError('declined', { status: 400 });
        },
        OPTS,
        fastDeps(),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });
});

describe('circuit breaker', () => {
  test('opens after the failure threshold and then fails fast', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw transientErr();
    };
    // maxAttempts=3, threshold=3 → first call exhausts 3 attempts and trips the breaker.
    await expect(withResilience('op', fn, OPTS, fastDeps())).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(3);

    // Breaker now OPEN: next call fails fast without invoking fn.
    const before = calls;
    await expect(withResilience('op', fn, OPTS, fastDeps())).rejects.toThrow(/circuit open/);
    expect(calls).toBe(before);
  });

  test('half-opens after cooldown and closes on success', async () => {
    let t = 0;
    const clock = () => t;
    let mode: 'fail' | 'ok' = 'fail';
    const fn = async () => {
      if (mode === 'fail') throw transientErr();
      return 'ok';
    };
    // Trip the breaker.
    await expect(withResilience('op', fn, OPTS, { ...fastDeps(clock) })).rejects.toBeInstanceOf(
      ProviderError,
    );

    // Still within cooldown → fail fast.
    t = 500;
    await expect(withResilience('op', fn, OPTS, { ...fastDeps(clock) })).rejects.toThrow(
      /circuit open/,
    );

    // After cooldown → HALF_OPEN trial; provider recovered → success closes it.
    t = 1500;
    mode = 'ok';
    const out = await withResilience('op', fn, OPTS, { ...fastDeps(clock) });
    expect(out).toBe('ok');

    // Closed again: normal operation.
    const out2 = await withResilience('op', fn, OPTS, { ...fastDeps(clock) });
    expect(out2).toBe('ok');
  });

  test('half-open trial failure re-opens the breaker', async () => {
    let t = 0;
    const clock = () => t;
    const fn = async () => {
      throw transientErr();
    };
    await expect(withResilience('op', fn, OPTS, fastDeps(clock))).rejects.toBeInstanceOf(
      ProviderError,
    );
    t = 1500; // cooldown passed → HALF_OPEN, single trial fails → OPEN again
    await expect(withResilience('op', fn, OPTS, fastDeps(clock))).rejects.toBeInstanceOf(
      ProviderError,
    );
    t = 1600; // still within new cooldown window → fail fast
    await expect(withResilience('op', fn, OPTS, fastDeps(clock))).rejects.toThrow(/circuit open/);
  });
});
