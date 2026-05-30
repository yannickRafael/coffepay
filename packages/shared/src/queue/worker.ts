import { Worker, type Processor, type Queue } from 'bullmq';
import { connectionOptions } from './connection.js';
import { paymentDlq, merchantNotifyDlq, pushToDlq } from './queues.js';
import { QUEUE_NAMES } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger({ module: 'queue-worker' });

// BullMQ has no native DLQ; on final failure we move the job to a dedicated one.
const DLQ_FOR: Record<string, (() => Queue) | undefined> = {
  [QUEUE_NAMES.paymentProcess]: paymentDlq,
  [QUEUE_NAMES.merchantNotify]: merchantNotifyDlq,
};

export interface WorkerOptions {
  concurrency?: number;
}

/** Create a Worker with structured logging and automatic DLQ on exhausted retries. */
export function createWorker<T>(
  name: string,
  processor: Processor<T>,
  opts: WorkerOptions = {},
): Worker<T> {
  const worker = new Worker<T>(name, processor, {
    connection: connectionOptions(),
    concurrency: opts.concurrency ?? 5,
  });

  worker.on('completed', (job) => {
    log.debug({ queue: name, jobId: job.id }, 'job completed');
  });

  worker.on('failed', async (job, err) => {
    log.error(
      { queue: name, jobId: job?.id, attempts: job?.attemptsMade, err: err.message },
      'job failed',
    );
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      const dlq = DLQ_FOR[name];
      if (dlq) {
        await pushToDlq(dlq(), {
          queue: name,
          jobId: job.id,
          data: job.data,
          failedReason: err.message,
          attemptsMade: job.attemptsMade,
          failedAt: new Date().toISOString(),
        });
        log.warn({ queue: name, jobId: job.id }, 'moved to DLQ');
      }
    }
  });

  return worker;
}
