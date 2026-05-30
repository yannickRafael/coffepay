// Load repo-root .env locally (no-op in CI where job env is set), then apply
// test-only rate-limit overrides so the per-merchant limit trips quickly.
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url) });

process.env.RATE_LIMIT_MAX = '1000'; // keep the global limiter out of the way
process.env.MERCHANT_RATE_LIMIT_MAX = '4'; // trip the per-merchant limiter fast
process.env.MERCHANT_RATE_LIMIT_WINDOW_MS = '60000';
