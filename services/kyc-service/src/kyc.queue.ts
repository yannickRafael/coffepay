import { Queue, type Worker } from 'bullmq';
import { connectionOptions, createWorker, createLogger } from '@coffepay/shared';
import { kycConfig } from './config.js';
import { runReassessmentSweep } from './kyc.monitor.js';

const log = createLogger({ service: 'kyc-service', module: 'monitor-queue' });
const QUEUE_NAME = 'kyc-monitor';

let queue: Queue | undefined;
function monitorQueue(): Queue {
  return (queue ??= new Queue(QUEUE_NAME, { connection: connectionOptions() }));
}

/** Register the repeatable sweep job (idempotent on a fixed jobId). */
export async function scheduleMonitor(): Promise<void> {
  const cfg = kycConfig();
  await monitorQueue().add(
    'sweep',
    {},
    {
      repeat: { every: cfg.KYC_MONITOR_INTERVAL_MS },
      jobId: 'kyc-monitor-sweep',
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
  log.info({ everyMs: cfg.KYC_MONITOR_INTERVAL_MS }, 'monitor sweep scheduled');
}

/** Start the worker that runs the passive reassessment sweep. */
export function startMonitorWorker(): Worker {
  return createWorker(QUEUE_NAME, async () => {
    await runReassessmentSweep();
  });
}

export async function closeMonitor(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
