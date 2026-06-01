import { RiskLevel } from '@coffepay/shared';
import { classifyRisk, decide } from './kyc.rules.js';
import type { KycConfig } from './config.js';

const cfg = {
  KYC_MAX_AMOUNT_MZN: 500000,
  KYC_HIGH_RISK_AMOUNT_MZN: 100000,
  KYC_MEDIUM_RISK_AMOUNT_MZN: 25000,
} as unknown as KycConfig;

describe('classifyRisk', () => {
  test('LOW below the medium threshold', () => {
    expect(classifyRisk(0, cfg)).toBe(RiskLevel.LOW);
    expect(classifyRisk(24999, cfg)).toBe(RiskLevel.LOW);
  });

  test('MEDIUM at/above the medium threshold', () => {
    expect(classifyRisk(25000, cfg)).toBe(RiskLevel.MEDIUM);
    expect(classifyRisk(99999, cfg)).toBe(RiskLevel.MEDIUM);
  });

  test('HIGH at/above the high threshold', () => {
    expect(classifyRisk(100000, cfg)).toBe(RiskLevel.HIGH);
    expect(classifyRisk(1_000_000, cfg)).toBe(RiskLevel.HIGH);
  });
});

describe('decide', () => {
  test('allows a normal amount with amount-based risk', () => {
    expect(decide({ amountMZN: 5000, isBlacklisted: false }, cfg)).toEqual({
      allowed: true,
      riskLevel: RiskLevel.LOW,
      reasons: [],
    });
    expect(decide({ amountMZN: 150000, isBlacklisted: false }, cfg).riskLevel).toBe(RiskLevel.HIGH);
  });

  test('blocks a blacklisted client', () => {
    const d = decide({ amountMZN: 100, isBlacklisted: true }, cfg);
    expect(d.allowed).toBe(false);
    expect(d.reasons).toEqual(['BLACKLISTED']);
    expect(d.riskLevel).toBe(RiskLevel.HIGH);
  });

  test('blocks an amount over the hard ceiling', () => {
    const d = decide({ amountMZN: 500001, isBlacklisted: false }, cfg);
    expect(d.allowed).toBe(false);
    expect(d.reasons).toEqual(['AMOUNT_LIMIT_EXCEEDED']);
  });

  test('blacklist takes precedence over the amount limit', () => {
    const d = decide({ amountMZN: 999999, isBlacklisted: true }, cfg);
    expect(d.reasons).toEqual(['BLACKLISTED']);
  });
});
