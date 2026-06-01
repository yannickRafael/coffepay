import { createHash } from 'node:crypto';
import { ValidationError } from '@coffepay/shared';

// Mozambican mobile: 9 national digits, 8[2-7] prefix (Tmcel/Vodacom/Movitel).
const NATIONAL_RE = /^8[2-7][0-9]{7}$/;
const COUNTRY_CODE = '258';

/**
 * Normalize an MSISDN to canonical `258XXXXXXXXX`. Accepts +258…, 258…,
 * 0XX… and bare 9-digit national forms. Throws ValidationError if invalid.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  let national = digits;
  if (national.startsWith(COUNTRY_CODE) && national.length === 12) {
    national = national.slice(3);
  } else if (national.startsWith('0') && national.length === 10) {
    national = national.slice(1);
  }
  if (!NATIONAL_RE.test(national)) {
    throw new ValidationError('Invalid Mozambican MSISDN', { phone: input });
  }
  return COUNTRY_CODE + national;
}

/** Deterministic SHA-256 of the canonical MSISDN, for storage and lookup. */
export function hashPhone(input: string): string {
  return createHash('sha256').update(normalizePhone(input)).digest('hex');
}

/** Best-effort hash; returns null for malformed entries (used for the blacklist). */
export function tryHashPhone(input: string): string | null {
  try {
    return hashPhone(input);
  } catch {
    return null;
  }
}
