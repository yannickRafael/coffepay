import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { sessionConfig } from './config.js';

const log = createLogger({ service: 'session-service' });
const cfg = sessionConfig();

createApp().listen(cfg.SESSION_SERVICE_PORT, () => {
  log.info(`[session-service] listening on port ${cfg.SESSION_SERVICE_PORT}`);
});
