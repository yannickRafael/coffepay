import { ProviderError } from '../errors.js';
import { loadMpesaConfig } from './config.js';
import { c2bPayment, setSimulatedOutage, clearSimulatedOutage } from './client.js';

// Force mock mode regardless of the ambient .env (which may carry real creds).
const mockCfg = loadMpesaConfig({ MPESA_MOCK: 'true' });

const params = {
  amount: '635.00',
  msisdn: '258841234567',
  reference: 'R1',
  thirdPartyReference: 'T1',
};

describe('simulated outage flag (T33)', () => {
  afterEach(() => clearSimulatedOutage());

  test('off: mock C2B succeeds', async () => {
    const res = await c2bPayment(params, mockCfg);
    expect(res.success).toBe(true);
  });

  test('on: mock C2B throws a transient ProviderError', async () => {
    setSimulatedOutage(true);
    await expect(c2bPayment(params, mockCfg)).rejects.toBeInstanceOf(ProviderError);
  });

  test('cleared: succeeds again (recovery)', async () => {
    setSimulatedOutage(true);
    await expect(c2bPayment(params, mockCfg)).rejects.toBeInstanceOf(ProviderError);
    clearSimulatedOutage();
    const res = await c2bPayment(params, mockCfg);
    expect(res.success).toBe(true);
  });
});
