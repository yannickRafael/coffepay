import { mpesaUrl, MPESA_PORTS } from './endpoints.js';
import { normalizeMsisdn } from './client.js';
import { loadMpesaConfig } from './config.js';

describe('mpesaUrl', () => {
  test('builds host:port/path per operation', () => {
    const cfg = loadMpesaConfig({ MPESA_API_HOST: 'api.example.mz' });
    expect(mpesaUrl(cfg, 'c2b')).toBe(
      `https://api.example.mz:${MPESA_PORTS.c2b}/ipg/v1x/c2bPayment/singleStage/`,
    );
    expect(mpesaUrl(cfg, 'query')).toContain(`:${MPESA_PORTS.query}/`);
  });

  test('strips scheme/port/path from the configured host', () => {
    const cfg = loadMpesaConfig({ MPESA_API_HOST: 'https://api.example.mz:9999/x' });
    expect(mpesaUrl(cfg, 'c2b')).toBe(
      `https://api.example.mz:${MPESA_PORTS.c2b}/ipg/v1x/c2bPayment/singleStage/`,
    );
  });
});

describe('normalizeMsisdn', () => {
  test.each([
    ['841234567', '258841234567'],
    ['258851234567', '258851234567'],
    ['+258 84 123 4567', '258841234567'],
  ])('normalizes %s -> %s', (input, expected) => {
    expect(normalizeMsisdn(input)).toBe(expected);
  });

  test.each(['12345', '821234567', '861234567'])('rejects non-84/85 %s', (bad) => {
    expect(() => normalizeMsisdn(bad)).toThrow();
  });
});
