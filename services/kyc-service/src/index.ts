import { createLogger } from '@coffepay/shared';
import { createApp } from './app.js';
import { kycConfig } from './config.js';
import { scheduleMonitor, startMonitorWorker } from './kyc.queue.js';

const log = createLogger({ service: 'kyc-service' });
const cfg = kycConfig();

createApp().listen(cfg.KYC_SERVICE_PORT, () => {
  log.info(`[kyc-service] listening on port ${cfg.KYC_SERVICE_PORT}`);
});

// Passive monitoring (RF13): repeatable BullMQ sweep + worker.
if (cfg.KYC_MONITOR_ENABLED) {
  startMonitorWorker();
  scheduleMonitor().catch((err) =>
    log.error({ err: (err as Error).message }, 'failed to schedule monitor'),
  );
} else {
  log.warn('[kyc-service] passive monitoring disabled (KYC_MONITOR_ENABLED=false)');
}
