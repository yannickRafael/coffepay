import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { fxConfig } from './config.js';

const log = createLogger({ service: 'fx-service' });
const cfg = fxConfig();

createApp().listen(cfg.FX_SERVICE_PORT, () => {
  log.info(`[fx-service] listening on port ${cfg.FX_SERVICE_PORT}`);
});
