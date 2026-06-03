import {
  prisma,
  createLogger,
  createWorker,
  c2bPayment,
  processResult,
  QUEUE_NAMES,
  PaymentStatus,
  type PaymentJob,
  type C2BParams,
  type MpesaResult,
  type NotifyFn,
} from '@coffepay/shared';
import type { Worker } from 'bullmq';
import { paymentConfig } from './config.js';

const log = createLogger({ service: 'payment-service', module: 'worker' });

export type C2BFn = (params: C2BParams) => Promise<MpesaResult>;

export interface PaymentWorkerDeps {
  c2b?: C2BFn;
  notify?: NotifyFn;
}

export interface ProcessOutcome {
  paymentId: string;
  status: PaymentStatus;
  skipped?: boolean;
}

/**
 * Process one payment job (RF07): run the synchronous C2B (ADR-001) then hand
 * the result to the shared processResult handler (T23) for authenticity,
 * persistence, state transition and merchant notification. Idempotent — a
 * Payment already terminal is skipped (no re-debit). Network/timeout errors
 * propagate so BullMQ retries (then DLQ).
 */
export async function processPaymentJob(
  job: PaymentJob,
  deps: PaymentWorkerDeps = {},
): Promise<ProcessOutcome> {
  const c2b = deps.c2b ?? c2bPayment;

  const payment = await prisma.payment.findUnique({ where: { id: job.paymentId } });
  if (!payment) {
    log.warn({ paymentId: job.paymentId }, 'payment not found; dropping job');
    return { paymentId: job.paymentId, status: PaymentStatus.FAILED, skipped: true };
  }
  if (payment.status === PaymentStatus.SUCCESS || payment.status === PaymentStatus.FAILED) {
    log.info({ paymentId: job.paymentId, status: payment.status }, 'already terminal; skipping');
    return { paymentId: job.paymentId, status: payment.status, skipped: true };
  }

  await prisma.payment.update({
    where: { id: job.paymentId },
    data: { attempts: { increment: 1 }, status: PaymentStatus.PENDING },
  });

  const request = {
    amount: job.amountMZN,
    msisdn: job.msisdn,
    reference: job.reference,
    thirdPartyReference: job.thirdPartyReference,
  };

  // Throws on network/timeout (ProviderError/TimeoutError) → BullMQ retry.
  const result = await c2b(request);

  const outcome = await processResult(
    { paymentId: job.paymentId, result, request },
    { notify: deps.notify },
  );

  log.info(
    { paymentId: job.paymentId, status: outcome.status, code: result.code },
    'payment processed',
  );
  return { paymentId: job.paymentId, status: outcome.status };
}

/** Start the BullMQ worker consuming the payment-process queue. */
export function startPaymentWorker(deps: PaymentWorkerDeps = {}): Worker<PaymentJob> {
  const { PAYMENT_WORKER_CONCURRENCY } = paymentConfig();
  return createWorker<PaymentJob>(
    QUEUE_NAMES.paymentProcess,
    async (job) => processPaymentJob(job.data, deps),
    { concurrency: PAYMENT_WORKER_CONCURRENCY },
  );
}
