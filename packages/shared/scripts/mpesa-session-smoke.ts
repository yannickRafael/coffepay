/**
 * Manual smoke test for the M-Pesa bearer token (T08).
 *
 * The Vodacom MZ OpenAPI bearer is the API key encrypted with the public key
 * (RSA PKCS#1 v1.5, base64) — there is no getSession call, so this builds the
 * token locally. End-to-end validation against the API happens in T09 (C2B).
 *
 * Setup: put MPESA_API_KEY, MPESA_PUBLIC_KEY, MPESA_ORIGIN,
 * MPESA_SERVICE_PROVIDER_CODE and MPESA_API_HOST (hostname only) in .env with
 * MPESA_MOCK=false. Then run from the repo root:  npm run mpesa:smoke
 *
 * Prints only a short prefix of the token (never the full secret).
 */
import { buildBearerToken, loadMpesaConfig, isMockMode, mpesaUrl } from '../src/index.js';

const cfg = loadMpesaConfig();
console.log('host        :', cfg.MPESA_API_HOST);
console.log('origin      :', cfg.MPESA_ORIGIN);
console.log('providerCode:', cfg.MPESA_SERVICE_PROVIDER_CODE);
console.log('mock mode   :', isMockMode(cfg));
console.log('c2b url     :', mpesaUrl(cfg, 'c2b'));

if (isMockMode(cfg)) {
  console.log('\n⚠ Mock mode ON (missing creds or MPESA_MOCK=true).');
  console.log('  Set MPESA_API_KEY + MPESA_PUBLIC_KEY in .env and MPESA_MOCK=false.');
}

try {
  const token = buildBearerToken(cfg);
  console.log('\nbearer      :', token.slice(0, 20) + '…', `(len ${token.length})`);
  console.log('✓ Bearer built. Validate end-to-end in T09 (C2B call).');
} catch (err) {
  console.error('\n✗ Failed to build bearer:', (err as Error).message);
  process.exit(1);
}
