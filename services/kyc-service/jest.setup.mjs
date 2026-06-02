// Load repo-root .env locally (no-op in CI). Set a deterministic blacklist
// BEFORE any module reads the config, since kycConfig() memoizes its result.
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url) });

process.env.KYC_BLACKLIST = '258870000000';

// Passive-monitoring thresholds lowered so integration tests need little data.
// These do not affect the active rules (KYC_MAX/HIGH/MEDIUM_AMOUNT).
process.env.KYC_MONITOR_ENABLED = 'false';
process.env.KYC_VELOCITY_MEDIUM = '2';
process.env.KYC_VELOCITY_HIGH = '3';
process.env.KYC_CUMULATIVE_MEDIUM_MZN = '1000';
process.env.KYC_CUMULATIVE_HIGH_MZN = '5000';
process.env.KYC_CUMULATIVE_BLACKLIST_MZN = '10000';
process.env.KYC_FAILURE_MIN_SAMPLES = '2';
process.env.KYC_FAILURE_RATE_HIGH = '0.5';
