import { createLogger } from '@coffepay/shared';
import { notificationConfig } from './config.js';
import { startNotifyWorker } from './notify.worker.js';

const log = createLogger({ service: 'notification-service' });
const cfg = notificationConfig();

if (cfg.NOTIFY_WORKER_ENABLED) {
  startNotifyWorker();
  log.info('[notification-service] merchant-notify worker started');
} else {
  log.warn('[notification-service] worker disabled (NOTIFY_WORKER_ENABLED=false)');
}
