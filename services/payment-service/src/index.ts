import { createLogger } from '@coffepay/shared';
import { paymentConfig } from './config.js';
import { startPaymentWorker } from './payment.worker.js';

const log = createLogger({ service: 'payment-service' });
const cfg = paymentConfig();

if (cfg.PAYMENT_WORKER_ENABLED) {
  startPaymentWorker();
  log.info('[payment-service] payment-process worker started');
} else {
  log.warn('[payment-service] worker disabled (PAYMENT_WORKER_ENABLED=false)');
}
