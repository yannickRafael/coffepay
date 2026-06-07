import { signPayload, verifySignature, parseSignatureHeader } from './hmac.js';

const SECRET = 'test-secret';

describe('signPayload / verifySignature', () => {
  test('round-trips a string body', () => {
    const body = JSON.stringify({ a: 1 });
    const signed = signPayload(body, SECRET);
    expect(verifySignature(body, signed.header, SECRET)).toBe(true);
  });

  test('rejects a tampered body', () => {
    const body = JSON.stringify({ amount: '10.00' });
    const signed = signPayload(body, SECRET);
    expect(verifySignature(body.replace('10.00', '99.99'), signed.header, SECRET)).toBe(false);
  });

  test('rejects a wrong secret', () => {
    const body = 'hello';
    const signed = signPayload(body, SECRET);
    expect(verifySignature(body, signed.header, 'other-secret')).toBe(false);
  });

  test('rejects a stale timestamp outside the tolerance', () => {
    const body = 'hello';
    const old = Math.floor(Date.now() / 1000) - 10_000;
    const signed = signPayload(body, SECRET, old);
    expect(verifySignature(body, signed.header, SECRET)).toBe(false);
    // Within an explicit large tolerance it verifies again.
    expect(verifySignature(body, signed.header, SECRET, { toleranceSec: 20_000 })).toBe(true);
  });

  test('rejects a malformed header', () => {
    expect(verifySignature('x', 'garbage', SECRET)).toBe(false);
  });
});

describe('parseSignatureHeader', () => {
  test('parses t and v1 parts', () => {
    const parsed = parseSignatureHeader('t=1700000000,v1=abc123');
    expect(parsed.t).toBe(1700000000);
    expect(parsed.v1).toBe('abc123');
  });
});
