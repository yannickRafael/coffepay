// Load repo-root .env locally (no-op in CI). Set a deterministic blacklist
// BEFORE any module reads the config, since kycConfig() memoizes its result.
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url) });

process.env.KYC_BLACKLIST = '258870000000';
