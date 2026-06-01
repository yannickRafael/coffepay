import { ValidationError } from '@coffepay/shared';
import { normalizePhone, hashPhone } from './phone.js';

describe('normalizePhone', () => {
  test('accepts the canonical and common input forms', () => {
    expect(normalizePhone('+258841234567')).toBe('258841234567');
    expect(normalizePhone('258841234567')).toBe('258841234567');
    expect(normalizePhone('0841234567')).toBe('258841234567');
    expect(normalizePhone('841234567')).toBe('258841234567');
    expect(normalizePhone('+258 84 123 4567')).toBe('258841234567');
  });

  test('accepts all Mozambican mobile prefixes 82-87', () => {
    for (const p of ['82', '83', '84', '85', '86', '87']) {
      expect(normalizePhone(`${p}1234567`)).toBe(`258${p}1234567`);
    }
  });

  test('rejects malformed numbers', () => {
    expect(() => normalizePhone('12345')).toThrow(ValidationError);
    expect(() => normalizePhone('881234567')).toThrow(ValidationError); // prefix 88 invalid
    expect(() => normalizePhone('25884123456')).toThrow(ValidationError); // too short
    expect(() => normalizePhone('')).toThrow(ValidationError);
  });
});

describe('hashPhone', () => {
  test('is deterministic and prefix-form independent', () => {
    const a = hashPhone('+258841234567');
    const b = hashPhone('0841234567');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test('differs for different numbers', () => {
    expect(hashPhone('841234567')).not.toBe(hashPhone('841234568'));
  });
});
