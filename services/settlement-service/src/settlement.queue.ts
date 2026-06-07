import { Queue, type Worker } from 'bullmq';
import { connectionOptions, createWorker, createLogger, runSettlements } from '@coffepay/shared';
import { settlementConfig } from './config.js';

const log = createLogger({ service: 'settlement-service', module: 'queue' });
const QUEUE_NAME = 'settlement-sweep';

let queue: Queue | undefined;
function sweepQueue(): Queue {
  return (queue ??= new Queue(QUEUE_NAME, { connection: connectionOptions() }));
}

/** Register the repeatable settlement sweep (idempotent on a fixed jobId). */
export async function scheduleSettlement(): Promise<void> {
  const cfg = settlementConfig();
  await sweepQueue().add(
    'sweep',
    {},
    {
      repeat: { every: cfg.SETTLEMENT_INTERVAL_MS },
      jobId: 'settlement-sweep',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  log.info({ everyMs: cfg.SETTLEMENT_INTERVAL_MS }, 'settlement sweep scheduled');
}

/** Start the worker that settles every merchant with pending transactions. */
export function startSettlementWorker(): Worker {
  return createWorker(QUEUE_NAME, async () => {
    const settlements = await runSettlements();
    if (settlements.length > 0) {
      log.info({ count: settlements.length }, 'settlements processed');
    }
  });
}

export async function closeSettlement(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
