// MSISDN helpers live in @coffepay/shared; re-exported here for local imports.
import { hashPhone } from '@coffepay/shared';

export { normalizePhone, hashPhone, isValidPhone } from '@coffepay/shared';

/** Best-effort hash; returns null for malformed entries (used for the blacklist). */
export function tryHashPhone(input: string): string | null {
  try {
    return hashPhone(input);
  } catch {
    return null;
  }
}
