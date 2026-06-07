import { generateKeyPairSync, privateDecrypt, constants } from 'node:crypto';
import { toPem, encryptWithPublicKey, buildBearerToken } from './session.js';
import { loadMpesaConfig } from './config.js';

// A throwaway RSA keypair for round-trip tests.
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicDerB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

describe('toPem', () => {
  test('wraps raw base64 DER into a PEM block', () => {
    const pem = toPem(publicDerB64);
    expect(pem.startsWith('-----BEGIN PUBLIC KEY-----')).toBe(true);
    expect(pem.trimEnd().endsWith('-----END PUBLIC KEY-----')).toBe(true);
    // 64-char wrapped body lines.
    const body = pem.split('\n').slice(1, -1);
    expect(body.every((l) => l.length <= 64)).toBe(true);
  });

  test('is idempotent when already PEM', () => {
    const pem = toPem(publicDerB64);
    expect(toPem(pem)).toBe(pem.trim());
  });
});

describe('encryptWithPublicKey', () => {
  test('round-trips: decrypting with the private key recovers the value', () => {
    const enc = encryptWithPublicKey('my-api-key', publicDerB64);
    const dec = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(enc, 'base64'),
    );
    expect(dec.toString('utf8')).toBe('my-api-key');
  });
});

describe('buildBearerToken', () => {
  test('mock mode returns a deterministic bearer without a key', () => {
    const cfg = loadMpesaConfig({ MPESA_MOCK: 'true' });
    expect(buildBearerToken(cfg)).toBe('Bearer MOCK_SESSION_TOKEN');
  });

  test('real mode encrypts the API key into the bearer', () => {
    const cfg = loadMpesaConfig({
      MPESA_MOCK: 'false',
      MPESA_API_KEY: 'real-key',
      MPESA_PUBLIC_KEY: publicDerB64,
    });
    const token = buildBearerToken(cfg);
    expect(token.startsWith('Bearer ')).toBe(true);
    const dec = privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(token.slice('Bearer '.length), 'base64'),
    );
    expect(dec.toString('utf8')).toBe('real-key');
  });
});
