// Load repo-root .env locally (no-op in CI where job env is set).
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url) });
