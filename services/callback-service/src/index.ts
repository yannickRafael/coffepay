import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { callbackConfig } from './config.js';

const log = createLogger({ service: 'callback-service' });
const cfg = callbackConfig();

createApp().listen(cfg.CALLBACK_SERVICE_PORT, () => {
  log.info(`[callback-service] listening on port ${cfg.CALLBACK_SERVICE_PORT}`);
});
