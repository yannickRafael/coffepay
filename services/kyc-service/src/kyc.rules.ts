import { RiskLevel } from '@coffepay/shared';
import type { KycConfig } from './config.js';

export type KycReason = 'BLACKLISTED' | 'AMOUNT_LIMIT_EXCEEDED';

export interface KycDecision {
  allowed: boolean;
  riskLevel: RiskLevel;
  reasons: KycReason[];
}

/** Classify transaction risk purely from the MZN amount. */
export function classifyRisk(amountMZN: number, cfg: KycConfig): RiskLevel {
  if (amountMZN >= cfg.KYC_HIGH_RISK_AMOUNT_MZN) return RiskLevel.HIGH;
  if (amountMZN >= cfg.KYC_MEDIUM_RISK_AMOUNT_MZN) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

/**
 * Pure AML decision (RF12): block blacklisted clients and amounts over the hard
 * ceiling; otherwise allow with an amount-based risk level.
 */
export function decide(
  input: { amountMZN: number; isBlacklisted: boolean },
  cfg: KycConfig,
): KycDecision {
  if (input.isBlacklisted) {
    return { allowed: false, riskLevel: RiskLevel.HIGH, reasons: ['BLACKLISTED'] };
  }
  if (input.amountMZN > cfg.KYC_MAX_AMOUNT_MZN) {
    return { allowed: false, riskLevel: RiskLevel.HIGH, reasons: ['AMOUNT_LIMIT_EXCEEDED'] };
  }
  return { allowed: true, riskLevel: classifyRisk(input.amountMZN, cfg), reasons: [] };
}
