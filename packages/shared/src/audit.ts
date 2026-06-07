import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

/** A Prisma client or an interactive-transaction client. */
type AuditClient = typeof prisma | Prisma.TransactionClient;

export interface AuditInput {
  action: string;
  entityType: string;
  /** UUID of the domain entity the event is about (Payment, Session, Webhook, …). */
  entityId: string;
  /** Actor (user/admin/system) UUID, if any. */
  actorId?: string | null;
  /** Related transaction UUID, if any. */
  transactionId?: string | null;
  /** Structured detail — MUST NOT contain secrets or MSISDN in clear (RNF07). */
  changes?: Prisma.InputJsonValue;
}

/**
 * Single entry point for audit logging (RNF07). Pass a transaction client to
 * record inside an atomic operation; otherwise it uses the shared prisma
 * client. Normalizes the AuditLog shape so every step audits consistently.
 */
export function writeAudit(input: AuditInput, client: AuditClient = prisma) {
  return client.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      actorId: input.actorId ?? null,
      transactionId: input.transactionId ?? null,
      changes: input.changes,
    },
  });
}
