import { prisma, createLogger, SessionStatus } from '@coffepay/shared';

const log = createLogger({ service: 'session-service', module: 'expiry' });

/**
 * Expire PENDING sessions whose `expiresAt` is in the past (RF02). Marks them
 * EXPIRED and writes one audit log per session. Idempotent: only PENDING rows
 * are touched, so re-running does no further work. Returns the count expired.
 */
export async function expireSessions(now: Date = new Date()): Promise<number> {
  const stale = await prisma.session.findMany({
    where: { status: SessionStatus.PENDING, expiresAt: { lt: now } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  const ids = stale.map((s) => s.id);

  const [updated] = await prisma.$transaction([
    prisma.session.updateMany({
      where: { id: { in: ids }, status: SessionStatus.PENDING },
      data: { status: SessionStatus.EXPIRED },
    }),
    prisma.auditLog.createMany({
      data: ids.map((id) => ({
        action: `SESSION_${SessionStatus.EXPIRED}`,
        entityType: 'Session',
        entityId: id,
        changes: { from: SessionStatus.PENDING, to: SessionStatus.EXPIRED, reason: 'ttl' },
      })),
    }),
  ]);

  log.info({ expired: updated.count }, 'expired stale sessions');
  return updated.count;
}

/**
 * Run `expireSessions` on an interval. The timer is unref'd so it never keeps
 * the process alive on its own. Returns a stop function.
 */
export function startExpirySweeper(intervalMs: number): () => void {
  const timer = setInterval(() => {
    expireSessions().catch((err) => {
      log.error({ err: (err as Error).message }, 'expiry sweep failed');
    });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
