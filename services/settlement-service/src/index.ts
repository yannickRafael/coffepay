import { createLogger } from '@coffepay/shared';
import { settlementConfig } from './config.js';
import { scheduleSettlement, startSettlementWorker } from './settlement.queue.js';

const log = createLogger({ service: 'settlement-service' });
const cfg = settlementConfig();

if (cfg.SETTLEMENT_WORKER_ENABLED) {
  startSettlementWorker();
  await scheduleSettlement();
  log.info('[settlement-service] settlement sweep worker started');
} else {
  log.warn('[settlement-service] worker disabled (SETTLEMENT_WORKER_ENABLED=false)');
}
