import {
  prisma,
  createLogger,
  createWorker,
  c2bPayment,
  QUEUE_NAMES,
  Prisma,
  PaymentStatus,
  TransactionStatus,
  type PaymentJob,
  type C2BParams,
  type MpesaResult,
} from '@coffepay/shared';
import type { Worker } from 'bullmq';
import { paymentConfig } from './config.js';

const log = createLogger({ service: 'payment-service', module: 'worker' });

export type C2BFn = (params: C2BParams) => Promise<MpesaResult>;

export interface PaymentWorkerDeps {
  c2b?: C2BFn;
}

export interface ProcessOutcome {
  paymentId: string;
  status: PaymentStatus;
  skipped?: boolean;
}

/**
 * Process one payment job (RF07): run the synchronous C2B (ADR-001), persist
 * the Transaction + ProviderRequest, and set the Payment terminal status.
 * Idempotent — a Payment already SUCCESS/FAILED is skipped (no re-debit).
 * Network/timeout errors propagate so BullMQ retries (then DLQ).
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

  const requestPayload = {
    amount: job.amountMZN,
    msisdn: job.msisdn,
    reference: job.reference,
    thirdPartyReference: job.thirdPartyReference,
  };

  // Throws on network/timeout (ProviderError/TimeoutError) → BullMQ retry.
  const result = await c2b(requestPayload);
  const status = result.success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;
  const now = new Date();

  const tx = await prisma.transaction.upsert({
    where: { paymentId: job.paymentId },
    create: {
      paymentId: job.paymentId,
      amountMZN: job.amountMZN,
      status,
      processedAt: now,
      confirmedAt: result.success ? now : null,
    },
    update: { status, processedAt: now, confirmedAt: result.success ? now : null },
  });

  await prisma.providerRequest.create({
    data: {
      transactionId: tx.id,
      provider: 'MPESA',
      requestPayload: requestPayload as Prisma.InputJsonValue,
      responsePayload: (result.raw ?? {}) as Prisma.InputJsonValue,
    },
  });

  const paymentStatus = result.success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
  await prisma.payment.update({
    where: { id: job.paymentId },
    data: { status: paymentStatus, completedAt: now },
  });

  log.info(
    { paymentId: job.paymentId, status: paymentStatus, code: result.code },
    'payment processed',
  );
  return { paymentId: job.paymentId, status: paymentStatus };
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
