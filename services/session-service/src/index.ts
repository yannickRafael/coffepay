import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { sessionConfig } from './config.js';
import { startExpirySweeper } from './session.expiry.js';

const log = createLogger({ service: 'session-service' });
const cfg = sessionConfig();

createApp().listen(cfg.SESSION_SERVICE_PORT, () => {
  log.info(`[session-service] listening on port ${cfg.SESSION_SERVICE_PORT}`);
});

startExpirySweeper(cfg.SESSION_EXPIRY_SWEEP_MS);
log.info(`[session-service] expiry sweeper every ${cfg.SESSION_EXPIRY_SWEEP_MS}ms`);
