// Load the repo-root .env for local runs. In CI the file is absent and the
// variables come from the job env — dotenv silently no-ops on a missing file.
import { config } from 'dotenv';
config({ path: new URL('../../.env', import.meta.url) });
