import { prisma, createLogger, writeAudit, PaymentStatus, SessionStatus } from '@coffepay/shared';
import { sessionConfig } from './config.js';
import { transitionSession } from './session.state.js';

const log = createLogger({ service: 'session-service', module: 'payment-timeout' });

/**
 * Fail payments that never got confirmed (RF08): a non-terminal Payment whose
 * session is still PROCESSING and was initiated before the cutoff is marked
 * FAILED, its session moved to FAILED, and the timeout audited. Idempotent —
 * only non-terminal payments on PROCESSING sessions are selected.
 */
export async function expireStuckPayments(now: Date = new Date()): Promise<number> {
  const cfg = sessionConfig();
  const cutoff = new Date(now.getTime() - cfg.PAYMENT_TIMEOUT_MS);

  const stuck = await prisma.payment.findMany({
    where: {
      status: { in: [PaymentStatus.INITIATED, PaymentStatus.PENDING] },
      initiatedAt: { lt: cutoff },
      session: { status: SessionStatus.PROCESSING },
    },
    select: { id: true, sessionId: true },
  });
  if (stuck.length === 0) return 0;

  let failed = 0;
  for (const p of stuck) {
    try {
      await prisma.payment.update({
        where: { id: p.id },
        data: { status: PaymentStatus.FAILED, completedAt: now },
      });
      await transitionSession(p.sessionId, SessionStatus.FAILED);
      await writeAudit({
        action: 'PAYMENT_TIMEOUT',
        entityType: 'Payment',
        entityId: p.id,
        changes: { reason: 'confirmation_timeout', timeoutMs: cfg.PAYMENT_TIMEOUT_MS },
      });
      failed++;
    } catch (err) {
      log.error({ paymentId: p.id, err: (err as Error).message }, 'timeout sweep failed');
    }
  }
  log.info({ failed }, 'failed stuck payments');
  return failed;
}

/** Run expireStuckPayments on an interval (unref'd). Returns a stop function. */
export function startPaymentTimeoutSweeper(intervalMs: number): () => void {
  const timer = setInterval(() => {
    expireStuckPayments().catch((err) =>
      log.error({ err: (err as Error).message }, 'payment timeout sweep failed'),
    );
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
