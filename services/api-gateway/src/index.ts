import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { gatewayConfig } from './config.js';

const log = createLogger({ service: 'api-gateway' });
const cfg = gatewayConfig();

createApp(cfg).listen(cfg.API_GATEWAY_PORT, () => {
  log.info(`[api-gateway] listening on port ${cfg.API_GATEWAY_PORT}`);
});
