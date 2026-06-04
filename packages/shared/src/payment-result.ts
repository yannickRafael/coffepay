import { Prisma, PaymentStatus, TransactionStatus, SessionStatus } from '@prisma/client';
import { prisma } from './db.js';
import { createLogger } from './logger.js';
import { NotFoundError, ValidationError } from './errors.js';
import { transitionSession } from './session-state.js';
import { enqueueNotify } from './queue/queues.js';
import type { MpesaResult } from './mpesa/types.js';

const log = createLogger({ module: 'payment-result' });

/** The original C2B request context (for ProviderRequest + authenticity). */
export interface ResultRequestContext {
  amount: number | string;
  msisdn: string;
  reference: string;
  thirdPartyReference: string;
}

export interface ProcessResultInput {
  paymentId: string;
  result: MpesaResult;
  request?: ResultRequestContext;
}

export interface ProcessResultOutcome {
  paymentId: string;
  status: PaymentStatus;
  sessionStatus: SessionStatus;
  notified: boolean;
  idempotent?: boolean;
}

export type NotifyFn = (job: {
  webhookId: string;
  merchantId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}) => Promise<unknown>;

export interface ProcessResultDeps {
  notify?: NotifyFn;
}

/**
 * Process a C2B result (RF09) and verify its authenticity (RF10): map the
 * outcome onto Payment + Transaction + Session, persist the ProviderRequest,
 * audit it and enqueue a signed merchant notification. Idempotent — a payment
 * already in a terminal state is left untouched and not re-notified.
 */
export async function processResult(
  input: ProcessResultInput,
  deps: ProcessResultDeps = {},
): Promise<ProcessResultOutcome> {
  const notify = deps.notify ?? enqueueNotify;
  const { paymentId, result } = input;

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { session: true, transaction: { include: { providerRequests: true } } },
  });
  if (!payment) {
    throw new NotFoundError('Payment not found', { paymentId });
  }

  // --- Authenticity (RF10) ---
  // Expected third-party reference: from the supplied request (worker path) or
  // a previously stored ProviderRequest (callback path). A mismatch or an
  // unverifiable result is rejected.
  const priorTpr = (payment.transaction?.providerRequests ?? [])
    .map(
      (pr) => (pr.requestPayload as { thirdPartyReference?: string } | null)?.thirdPartyReference,
    )
    .find((v): v is string => typeof v === 'string');
  const expectedTpr = input.request?.thirdPartyReference ?? priorTpr;

  if (result.thirdPartyReference) {
    if (!expectedTpr) {
      throw new ValidationError('Cannot verify result authenticity', { paymentId });
    }
    if (result.thirdPartyReference !== expectedTpr) {
      throw new ValidationError('Result third-party reference mismatch', {
        paymentId,
        expected: expectedTpr,
        got: result.thirdPartyReference,
      });
    }
  } else if (!expectedTpr) {
    throw new ValidationError('Cannot verify result authenticity', { paymentId });
  }

  // --- Idempotency ---
  if (payment.status === PaymentStatus.SUCCESS || payment.status === PaymentStatus.FAILED) {
    log.info({ paymentId, status: payment.status }, 'already terminal; skipping');
    return {
      paymentId,
      status: payment.status,
      sessionStatus: payment.session.status,
      notified: false,
      idempotent: true,
    };
  }

  const success = result.success;
  const txStatus = success ? TransactionStatus.SUCCESS : TransactionStatus.FAILED;
  const paymentStatus = success ? PaymentStatus.SUCCESS : PaymentStatus.FAILED;
  const targetSession = success ? SessionStatus.COMPLETED : SessionStatus.FAILED;
  const now = new Date();

  // --- Persist (atomic): Transaction + ProviderRequest + Payment + Ledger ---
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.upsert({
      where: { paymentId },
      create: {
        paymentId,
        amountMZN: payment.session.amountMZN,
        status: txStatus,
        processedAt: now,
        confirmedAt: success ? now : null,
      },
      update: { status: txStatus, processedAt: now, confirmedAt: success ? now : null },
    });
    if (input.request) {
      await tx.providerRequest.create({
        data: {
          transactionId: transaction.id,
          provider: 'MPESA',
          requestPayload: { ...input.request } as Prisma.InputJsonValue,
          responsePayload: (result.raw ?? {}) as Prisma.InputJsonValue,
        },
      });
    }
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: paymentStatus, completedAt: now },
    });
    // Double-entry ledger on success only (RF21), in the same atomic transaction.
    if (success) {
      await recordLedger(tx, transaction.id, payment.session.merchantId, payment.session.amountMZN);
    }
  });

  await transitionSession(payment.sessionId, targetSession);

  await prisma.auditLog.create({
    data: {
      action: 'PAYMENT_RESULT_PROCESSED',
      entityType: 'Payment',
      entityId: paymentId,
      changes: { success, code: result.code, sessionStatus: targetSession },
    },
  });

  const event = success ? 'payment.success' : 'payment.failed';
  const notified = await enqueueMerchantNotification(
    payment.session.merchantId,
    event,
    {
      sessionId: payment.sessionId,
      paymentId,
      status: paymentStatus,
      amountMZN: payment.session.amountMZN.toFixed(2),
    },
    notify,
  );

  return { paymentId, status: paymentStatus, sessionStatus: targetSession, notified };
}

/**
 * Record a simple double-entry ledger for a successful transaction (RF21):
 * a DEBIT (customer) and a CREDIT (merchant payable, with a running balance).
 * Runs inside the caller's atomic transaction. Idempotent per transaction.
 */
async function recordLedger(
  tx: Prisma.TransactionClient,
  transactionId: string,
  merchantId: string,
  amount: Prisma.Decimal,
): Promise<void> {
  const existing = await tx.ledgerEntry.count({ where: { transactionId } });
  if (existing > 0) return;

  const prior = await tx.ledgerEntry.aggregate({
    _sum: { amount: true },
    where: { entryType: 'CREDIT', transaction: { payment: { session: { merchantId } } } },
  });
  const merchantBalance = new Prisma.Decimal(prior._sum.amount ?? 0).plus(amount);

  await tx.ledgerEntry.createMany({
    data: [
      {
        transactionId,
        entryType: 'DEBIT',
        amount,
        balanceAfter: amount,
        description: 'Customer wallet debit (M-Pesa)',
      },
      {
        transactionId,
        entryType: 'CREDIT',
        amount,
        balanceAfter: merchantBalance,
        description: `Merchant payable ${merchantId}`,
      },
    ],
  });

  await tx.auditLog.create({
    data: {
      action: 'LEDGER_RECORDED',
      entityType: 'Transaction',
      entityId: transactionId,
      transactionId,
      changes: { amount: amount.toFixed(2), merchantBalance: merchantBalance.toFixed(2) },
    },
  });
}

/** Resolve the merchant's active webhook for the event and enqueue a notify job. */
async function enqueueMerchantNotification(
  merchantId: string,
  event: string,
  payload: Record<string, unknown>,
  notify: NotifyFn,
): Promise<boolean> {
  const webhook = await prisma.webhook.findFirst({ where: { merchantId, isActive: true } });
  if (!webhook) return false;
  const events = webhook.events.split(',').map((e) => e.trim());
  if (events.length > 0 && !events.includes(event)) return false;

  await notify({
    webhookId: webhook.id,
    merchantId,
    url: webhook.url,
    event,
    payload: { event, ...payload },
  });
  return true;
}
