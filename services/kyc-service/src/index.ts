import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { kycConfig } from './config.js';

const log = createLogger({ service: 'kyc-service' });
const cfg = kycConfig();

createApp().listen(cfg.KYC_SERVICE_PORT, () => {
  log.info(`[kyc-service] listening on port ${cfg.KYC_SERVICE_PORT}`);
});
