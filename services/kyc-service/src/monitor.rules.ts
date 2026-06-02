import { RiskLevel } from '@coffepay/shared';
import type { KycConfig } from './config.js';

export type MonitorReason =
  | 'VELOCITY_MEDIUM'
  | 'VELOCITY_HIGH'
  | 'CUMULATIVE_MEDIUM'
  | 'CUMULATIVE_HIGH'
  | 'CUMULATIVE_BLACKLIST'
  | 'HIGH_FAILURE_RATE';

export interface BehaviourSignals {
  count: number; // payments in the window
  failedCount: number; // FAILED payments in the window
  accumulatedMZN: number; // sum of SUCCESS amounts in the window
}

export interface BehaviourAssessment {
  riskLevel: RiskLevel;
  blacklist: boolean;
  reasons: MonitorReason[];
}

const ORDER: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
};

/** Keep the higher of two risk levels. */
function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/**
 * Passive behavioural assessment (RF13). Pure: derives a risk level (and an
 * auto-blacklist flag) from aggregated signals. Final risk is the highest any
 * single rule produces.
 */
export function assessBehaviour(signals: BehaviourSignals, cfg: KycConfig): BehaviourAssessment {
  let riskLevel: RiskLevel = RiskLevel.LOW;
  let blacklist = false;
  const reasons: MonitorReason[] = [];

  // Velocity
  if (signals.count >= cfg.KYC_VELOCITY_HIGH) {
    riskLevel = maxRisk(riskLevel, RiskLevel.HIGH);
    reasons.push('VELOCITY_HIGH');
  } else if (signals.count >= cfg.KYC_VELOCITY_MEDIUM) {
    riskLevel = maxRisk(riskLevel, RiskLevel.MEDIUM);
    reasons.push('VELOCITY_MEDIUM');
  }

  // Cumulative amount
  if (signals.accumulatedMZN >= cfg.KYC_CUMULATIVE_BLACKLIST_MZN) {
    riskLevel = maxRisk(riskLevel, RiskLevel.HIGH);
    blacklist = true;
    reasons.push('CUMULATIVE_BLACKLIST');
  } else if (signals.accumulatedMZN >= cfg.KYC_CUMULATIVE_HIGH_MZN) {
    riskLevel = maxRisk(riskLevel, RiskLevel.HIGH);
    reasons.push('CUMULATIVE_HIGH');
  } else if (signals.accumulatedMZN >= cfg.KYC_CUMULATIVE_MEDIUM_MZN) {
    riskLevel = maxRisk(riskLevel, RiskLevel.MEDIUM);
    reasons.push('CUMULATIVE_MEDIUM');
  }

  // Failure rate (only once there are enough samples)
  if (
    signals.count >= cfg.KYC_FAILURE_MIN_SAMPLES &&
    signals.failedCount / signals.count >= cfg.KYC_FAILURE_RATE_HIGH
  ) {
    riskLevel = maxRisk(riskLevel, RiskLevel.HIGH);
    reasons.push('HIGH_FAILURE_RATE');
  }

  return { riskLevel, blacklist, reasons };
}
