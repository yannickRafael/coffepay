import { constants, publicEncrypt } from 'node:crypto';
import { loadMpesaConfig, isMockMode, type MpesaEnv } from './config.js';

const MOCK_BEARER = 'Bearer MOCK_SESSION_TOKEN';

/** Wrap a raw base64 (DER) public key from the Vodacom portal into PEM. */
export function toPem(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;
  const body =
    trimmed
      .replace(/\s+/g, '')
      .match(/.{1,64}/g)
      ?.join('\n') ?? '';
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/** RSA-encrypt a value with the public key (PKCS#1 v1.5) → base64. */
export function encryptWithPublicKey(value: string, publicKey: string): string {
  const encrypted = publicEncrypt(
    { key: toPem(publicKey), padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(value, 'utf8'),
  );
  return encrypted.toString('base64');
}

/**
 * Build the Authorization bearer token for the Vodacom Moçambique OpenAPI.
 *
 * Per the official MZ flow (ref: ivanruby/mpesa-mz-nodejs-lib) there is NO
 * getSession exchange: the bearer is simply the API key encrypted with the
 * public key (RSA PKCS#1 v1.5), base64-encoded, prefixed with "Bearer ".
 * In mock mode returns a deterministic value without touching the key.
 */
export function buildBearerToken(cfg: MpesaEnv = loadMpesaConfig()): string {
  if (isMockMode(cfg)) return MOCK_BEARER;
  const apiKey = cfg.MPESA_API_KEY as string;
  const publicKey = cfg.MPESA_PUBLIC_KEY as string;
  return `Bearer ${encryptWithPublicKey(apiKey, publicKey)}`;
}
