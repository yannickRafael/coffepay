import axios from 'axios';
import { ProviderError } from '@coffepay/shared';
import { sessionConfig } from './config.js';

export interface KycCheckResult {
  clientId: string;
  allowed: boolean;
  riskLevel: string;
  reasons: string[];
}

/** Call the kyc-service active validation (RF12) for a phone + amount. */
export async function checkKyc(phone: string, amountMZN: string | number): Promise<KycCheckResult> {
  const cfg = sessionConfig();
  try {
    const res = await axios.post(
      `${cfg.KYC_SERVICE_URL}/kyc/validate`,
      { phone, amountMZN },
      { timeout: cfg.KYC_REQUEST_TIMEOUT_MS },
    );
    return res.data as KycCheckResult;
  } catch (err) {
    throw new ProviderError('KYC service unavailable', { reason: (err as Error).message });
  }
}

/** Function shape used by the pay flow; overridable in tests. */
export type KycCheckFn = (phone: string, amountMZN: string | number) => Promise<KycCheckResult>;
