import type { Queue } from 'bullmq';
import { NotFoundError, ValidationError } from '../errors.js';
import { createLogger } from '../logger.js';
import { writeAudit } from '../audit.js';
import { paymentDlq, merchantNotifyDlq, enqueuePayment, enqueueNotify } from './queues.js';
import { QUEUE_NAMES, type DeadLetter, type PaymentJob, type MerchantNotifyJob } from './types.js';

const log = createLogger({ module: 'dlq' });

// The inspectable DLQs, keyed by name.
const DLQS: Record<string, (() => Queue) | undefined> = {
  [QUEUE_NAMES.paymentProcessDlq]: paymentDlq,
  [QUEUE_NAMES.merchantNotifyDlq]: merchantNotifyDlq,
};

export interface DeadLetterView extends DeadLetter {
  id: string;
}

function resolveDlq(dlqName: string): Queue {
  const factory = DLQS[dlqName];
  if (!factory) {
    throw new ValidationError('Unknown DLQ', { dlqName, known: Object.keys(DLQS) });
  }
  return factory();
}

/** List dead letters on a DLQ (paginated). Dead letters sit unprocessed (no worker). */
export async function listDeadLetters(
  dlqName: string,
  opts: { start?: number; end?: number } = {},
): Promise<DeadLetterView[]> {
  const q = resolveDlq(dlqName);
  const start = opts.start ?? 0;
  const end = opts.end ?? 49;
  const jobs = await q.getJobs(
    ['waiting', 'paused', 'delayed', 'active', 'completed', 'failed'],
    start,
    end,
  );
  return jobs
    .filter((j) => j.id != null)
    .map((j) => {
      const d = j.data as DeadLetter;
      return {
        id: String(j.id),
        queue: d.queue,
        jobId: d.jobId,
        data: d.data,
        failedReason: d.failedReason,
        attemptsMade: d.attemptsMade,
        failedAt: d.failedAt,
      };
    });
}

export interface ReprocessResult {
  reprocessed: true;
  targetQueue: string;
}

/**
 * Re-enqueue a dead letter onto its original queue and remove it from the DLQ.
 * Reprocessing is safe to repeat: the payment path is idempotent (single
 * payment per session, terminal payments are skipped) and notifications are
 * filtered/deduplicated, so no double debit or double delivery (RNF05). Audits
 * DLQ_REPROCESSED.
 */
export async function reprocessDeadLetter(dlqName: string, id: string): Promise<ReprocessResult> {
  const q = resolveDlq(dlqName);
  const job = await q.getJob(id);
  if (!job) {
    throw new NotFoundError('Dead letter not found', { dlqName, id });
  }
  const letter = job.data as DeadLetter;

  // Audit against the original domain entity (UUID): Payment or Webhook.
  let entityType: string;
  let entityId: string;
  if (letter.queue === QUEUE_NAMES.paymentProcess) {
    const data = letter.data as PaymentJob;
    await enqueuePayment(data);
    entityType = 'Payment';
    entityId = data.paymentId;
  } else if (letter.queue === QUEUE_NAMES.merchantNotify) {
    const data = letter.data as MerchantNotifyJob;
    await enqueueNotify(data);
    entityType = 'Webhook';
    entityId = data.webhookId;
  } else {
    throw new ValidationError('Dead letter has unknown origin queue', { queue: letter.queue });
  }

  await job.remove();

  await writeAudit({
    action: 'DLQ_REPROCESSED',
    entityType,
    entityId,
    changes: {
      dlq: dlqName,
      dlqJobId: id,
      targetQueue: letter.queue,
      originalJobId: letter.jobId ?? null,
    },
  });

  log.info({ dlq: dlqName, id, targetQueue: letter.queue }, 'dead letter reprocessed');
  return { reprocessed: true, targetQueue: letter.queue };
}
