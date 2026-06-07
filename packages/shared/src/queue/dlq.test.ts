import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { QUEUE_NAMES, type DeadLetter, type PaymentJob } from './types.js';
import { paymentDlq, paymentQueue, pushToDlq, closeQueues } from './queues.js';
import { listDeadLetters, reprocessDeadLetter } from './dlq.js';

const PAYMENT_ID = randomUUID();

function deadPaymentJob(): DeadLetter<PaymentJob> {
  return {
    queue: QUEUE_NAMES.paymentProcess,
    jobId: PAYMENT_ID,
    data: {
      paymentId: PAYMENT_ID,
      sessionId: 's',
      msisdn: '258841234567',
      amountMZN: '635.00',
      reference: 'R1',
      thirdPartyReference: 'T1',
    },
    failedReason: 'ECONNREFUSED',
    attemptsMade: 5,
    failedAt: new Date().toISOString(),
  };
}

afterAll(async () => {
  // Clean any leftover jobs we created and the audit row.
  const target = await paymentQueue().getJob(PAYMENT_ID);
  if (target) await target.remove();
  await prisma.auditLog.deleteMany({ where: { action: 'DLQ_REPROCESSED', entityId: PAYMENT_ID } });
  await closeQueues();
  await prisma.$disconnect();
});

describe('DLQ inspect + reprocess (T34)', () => {
  test('lists a pushed dead letter then reprocesses it onto the origin queue', async () => {
    const dlq = paymentDlq();
    const added = await pushToDlq(dlq, deadPaymentJob());

    // Inspect: our dead letter is visible.
    const items = await listDeadLetters(QUEUE_NAMES.paymentProcessDlq);
    const mine = items.find((i) => i.jobId === PAYMENT_ID);
    expect(mine).toBeDefined();
    expect(mine?.failedReason).toBe('ECONNREFUSED');
    expect(mine?.queue).toBe(QUEUE_NAMES.paymentProcess);

    // Reprocess: re-enqueued on payment-process, removed from the DLQ, audited.
    const res = await reprocessDeadLetter(QUEUE_NAMES.paymentProcessDlq, String(added.id));
    expect(res).toEqual({ reprocessed: true, targetQueue: QUEUE_NAMES.paymentProcess });

    const requeued = await paymentQueue().getJob(PAYMENT_ID);
    expect(requeued).toBeTruthy();

    const gone = await dlq.getJob(String(added.id));
    expect(gone).toBeUndefined();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'DLQ_REPROCESSED', entityId: PAYMENT_ID },
    });
    expect(audit).not.toBeNull();
    expect((audit?.changes as { dlqJobId?: string })?.dlqJobId).toBe(String(added.id));
  });

  test('unknown DLQ name is rejected', async () => {
    await expect(listDeadLetters('not-a-queue')).rejects.toThrow(/Unknown DLQ/);
  });

  test('reprocessing a missing dead letter throws NotFound', async () => {
    await expect(reprocessDeadLetter(QUEUE_NAMES.paymentProcessDlq, 'nope-9999')).rejects.toThrow(
      /not found/i,
    );
  });
});
