import { createHash } from 'node:crypto';
import { normalizePhone, isValidPhone, hashPhone } from './phone.js';

describe('normalizePhone', () => {
  test.each([
    ['841234567', '258841234567'],
    ['0841234567', '258841234567'],
    ['+258841234567', '258841234567'],
    ['258841234567', '258841234567'],
    ['85 123 4567', '258851234567'],
    ['821234567', '258821234567'],
    ['871234567', '258871234567'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each(['12345', '811234567', '8412345', '25884123456', ''])('rejects invalid %s', (bad) => {
    expect(() => normalizePhone(bad)).toThrow();
  });
});

describe('isValidPhone', () => {
  test('true for valid, false for invalid', () => {
    expect(isValidPhone('841234567')).toBe(true);
    expect(isValidPhone('12345')).toBe(false);
  });
});

describe('hashPhone', () => {
  test('is the SHA-256 of the canonical MSISDN (deterministic, 64 hex)', () => {
    const h = hashPhone('0841234567');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(createHash('sha256').update('258841234567').digest('hex'));
    // Same number in different formats hashes equally.
    expect(hashPhone('+258841234567')).toBe(h);
  });
});
