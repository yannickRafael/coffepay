/**
 * Manual end-to-end smoke test for a C2B payment (T09) against the real
 * Vodacom MZ sandbox. Triggers a PIN prompt on the test MSISDN's device.
 *
 * Setup: fill the MPESA_* vars in .env (MPESA_MOCK=false), then run:
 *   npm run mpesa:c2b -- <amount> <msisdn>
 * Example:
 *   npm run mpesa:c2b -- 10 848500000
 *
 * Without args it uses MPESA_TEST_AMOUNT / MPESA_TEST_MSISDN from .env.
 */
import { c2bPayment, loadMpesaConfig, isMockMode, mpesaUrl } from '../src/index.js';

const cfg = loadMpesaConfig();
console.log('c2b url  :', mpesaUrl(cfg, 'c2b'));
const amount = process.argv[2] ?? process.env.MPESA_TEST_AMOUNT ?? '10';
const msisdn = process.argv[3] ?? process.env.MPESA_TEST_MSISDN ?? '';
const reference = `T${Date.now().toString().slice(-9)}`;
const thirdPartyReference = `R${Date.now().toString().slice(-9)}`;

console.log('mock mode:', isMockMode(cfg));
console.log('amount   :', amount, '| msisdn:', msisdn || '(none)');
console.log('reference:', reference, '| 3rd-party:', thirdPartyReference);

if (!msisdn) {
  console.error('\n✗ Provide an MSISDN: npm run mpesa:c2b -- <amount> <msisdn>');
  process.exit(1);
}

console.log('\nSending C2B (confirm the PIN on the device)…');
c2bPayment({ amount, msisdn, reference, thirdPartyReference }, cfg)
  .then((r) => {
    console.log('\nResult:');
    console.log('  success      :', r.success);
    console.log('  code         :', r.code);
    console.log('  message      :', r.message);
    console.log('  transactionId:', r.transactionId);
    console.log('  conversationId:', r.conversationId);
    process.exit(r.success ? 0 : 2);
  })
  .catch((err) => {
    console.error('\n✗ Error:', err?.message, err?.details ?? '');
    process.exit(1);
  });
