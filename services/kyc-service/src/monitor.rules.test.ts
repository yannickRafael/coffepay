import { RiskLevel } from '@coffepay/shared';
import { assessBehaviour } from './monitor.rules.js';
import type { KycConfig } from './config.js';

const cfg = {
  KYC_VELOCITY_MEDIUM: 5,
  KYC_VELOCITY_HIGH: 10,
  KYC_CUMULATIVE_MEDIUM_MZN: 100000,
  KYC_CUMULATIVE_HIGH_MZN: 300000,
  KYC_CUMULATIVE_BLACKLIST_MZN: 1000000,
  KYC_FAILURE_MIN_SAMPLES: 5,
  KYC_FAILURE_RATE_HIGH: 0.5,
} as unknown as KycConfig;

const quiet = { count: 1, failedCount: 0, accumulatedMZN: 500 };

describe('assessBehaviour', () => {
  test('quiet client stays LOW with no reasons', () => {
    expect(assessBehaviour(quiet, cfg)).toEqual({
      riskLevel: RiskLevel.LOW,
      blacklist: false,
      reasons: [],
    });
  });

  test('velocity raises risk', () => {
    const med = assessBehaviour({ count: 5, failedCount: 0, accumulatedMZN: 0 }, cfg);
    expect(med.riskLevel).toBe(RiskLevel.MEDIUM);
    expect(med.reasons).toContain('VELOCITY_MEDIUM');

    const high = assessBehaviour({ count: 10, failedCount: 0, accumulatedMZN: 0 }, cfg);
    expect(high.riskLevel).toBe(RiskLevel.HIGH);
    expect(high.reasons).toContain('VELOCITY_HIGH');
  });

  test('cumulative amount raises risk; critical triggers blacklist', () => {
    expect(
      assessBehaviour({ count: 1, failedCount: 0, accumulatedMZN: 100000 }, cfg).riskLevel,
    ).toBe(RiskLevel.MEDIUM);
    expect(
      assessBehaviour({ count: 1, failedCount: 0, accumulatedMZN: 300000 }, cfg).riskLevel,
    ).toBe(RiskLevel.HIGH);

    const bl = assessBehaviour({ count: 1, failedCount: 0, accumulatedMZN: 1000000 }, cfg);
    expect(bl.blacklist).toBe(true);
    expect(bl.riskLevel).toBe(RiskLevel.HIGH);
    expect(bl.reasons).toContain('CUMULATIVE_BLACKLIST');
  });

  test('high failure rate trips only with enough samples', () => {
    // 1 failed of 1 → below KYC_FAILURE_MIN_SAMPLES, no failure reason.
    const tooFew = assessBehaviour({ count: 1, failedCount: 1, accumulatedMZN: 0 }, cfg);
    expect(tooFew.reasons).not.toContain('HIGH_FAILURE_RATE');

    const tripped = assessBehaviour({ count: 6, failedCount: 4, accumulatedMZN: 0 }, cfg);
    expect(tripped.riskLevel).toBe(RiskLevel.HIGH);
    expect(tripped.reasons).toContain('HIGH_FAILURE_RATE');
  });

  test('final risk is the highest across signals', () => {
    // velocity MEDIUM + cumulative HIGH → HIGH
    const r = assessBehaviour({ count: 5, failedCount: 0, accumulatedMZN: 300000 }, cfg);
    expect(r.riskLevel).toBe(RiskLevel.HIGH);
    expect(r.reasons).toEqual(expect.arrayContaining(['VELOCITY_MEDIUM', 'CUMULATIVE_HIGH']));
  });
});
