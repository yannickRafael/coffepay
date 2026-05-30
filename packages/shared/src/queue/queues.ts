import { Queue, type JobsOptions } from 'bullmq';
import { connectionOptions } from './connection.js';
import { QUEUE_NAMES, type PaymentJob, type MerchantNotifyJob, type DeadLetter } from './types.js';

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 1000,
  removeOnFail: false, // keep failed jobs for inspection before they reach the DLQ
};

// Lazy queue singletons so importing @coffepay/shared opens no Redis socket.
const queues = new Map<string, Queue>();

function getQueue(name: string, withDefaults = true): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: connectionOptions(),
      ...(withDefaults ? { defaultJobOptions } : {}),
    });
    queues.set(name, q);
  }
  return q;
}

export const paymentQueue = (): Queue => getQueue(QUEUE_NAMES.paymentProcess);
export const merchantNotifyQueue = (): Queue => getQueue(QUEUE_NAMES.merchantNotify);
export const paymentDlq = (): Queue => getQueue(QUEUE_NAMES.paymentProcessDlq, false);
export const merchantNotifyDlq = (): Queue => getQueue(QUEUE_NAMES.merchantNotifyDlq, false);

export function enqueuePayment(data: PaymentJob, opts?: JobsOptions) {
  return paymentQueue().add('process', data, { jobId: data.paymentId, ...opts });
}

export function enqueueNotify(data: MerchantNotifyJob, opts?: JobsOptions) {
  return merchantNotifyQueue().add('notify', data, opts);
}

/** Push a dead letter onto the matching DLQ (called by the worker on final failure). */
export function pushToDlq<T>(dlq: Queue, letter: DeadLetter<T>) {
  return dlq.add('dead', letter, { removeOnComplete: false });
}

/** Close all open queue connections (graceful shutdown / tests). */
export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
