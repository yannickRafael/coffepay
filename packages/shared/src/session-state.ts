import { SessionStatus, type Session } from '@prisma/client';
import { prisma } from './db.js';
import { ConflictError, NotFoundError } from './errors.js';

/**
 * Allowed session state transitions (RF02). Terminal states have no outgoing
 * edges. Any transition not listed here is rejected.
 */
export const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  [SessionStatus.PENDING]: [SessionStatus.PROCESSING, SessionStatus.EXPIRED, SessionStatus.FAILED],
  [SessionStatus.PROCESSING]: [SessionStatus.COMPLETED, SessionStatus.FAILED],
  [SessionStatus.COMPLETED]: [],
  [SessionStatus.FAILED]: [],
  [SessionStatus.EXPIRED]: [],
};

/** Throw ConflictError (409) if `from -> to` is not a permitted transition. */
export function assertTransition(from: SessionStatus, to: SessionStatus): void {
  if (from === to) return; // no-op transition is idempotent, not an error
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ConflictError(`Illegal session transition ${from} -> ${to}`, { from, to });
  }
}

/**
 * Move a session to a new state, enforcing the state machine and writing an
 * audit log. Returns the updated session. Idempotent if already in `to`.
 */
export async function transitionSession(
  sessionId: string,
  to: SessionStatus,
  actorId?: string,
): Promise<Session> {
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    throw new NotFoundError('Session not found', { sessionId });
  }
  if (session.status === to) return session;

  assertTransition(session.status, to);

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { status: to },
  });

  await prisma.auditLog.create({
    data: {
      action: `SESSION_${to}`,
      entityType: 'Session',
      entityId: sessionId,
      actorId: actorId ?? null,
      changes: { from: session.status, to },
    },
  });

  return updated;
}
