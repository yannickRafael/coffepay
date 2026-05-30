import bcrypt from 'bcryptjs';

const ROUNDS = 10;

/** Hash a secret (API key / phone) with bcrypt. Never store the raw value. */
export function hashSecret(raw: string): Promise<string> {
  return bcrypt.hash(raw, ROUNDS);
}

/** Constant-time-ish bcrypt compare of a raw secret against a stored hash. */
export function verifySecret(raw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(raw, hash);
}
