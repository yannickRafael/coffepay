import { z } from 'zod';
import {
  prisma,
  ValidationError,
  NotFoundError,
  ConflictError,
  SessionStatus,
  normalizePhone,
  writeAudit,
} from '@coffepay/shared';
import { sessionConfig } from './config.js';
import { fetchQuote, type QuoteFn } from './fx.client.js';

export const createSessionSchema = z.object({
  orderId: z.string().min(1),
  amountUSD: z.coerce.number().positive(),
  callbackUrl: z.string().url(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export interface CreateSessionResult {
  sessionId: string;
  status: string;
  amountUSD: string;
  amountMZN: string;
  rate: string;
  checkoutUrl: string;
  expiresAt: string;
}

/**
 * Create a payment session: quote FX, persist Session (PENDING) linked to the
 * FXRate snapshot, write an audit log, and return the checkout URL.
 * `quoteFn` is injectable for testing.
 */
export async function createSession(
  input: CreateSessionInput,
  merchantId: string,
  quoteFn: QuoteFn = fetchQuote,
): Promise<CreateSessionResult> {
  const parsed = createSessionSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Invalid session payload', parsed.error.flatten());
  }
  const { orderId, amountUSD, callbackUrl } = parsed.data;
  const cfg = sessionConfig();

  const quote = await quoteFn(amountUSD);
  const expiresAt = new Date(Date.now() + cfg.SESSION_TTL_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      merchantId,
      orderId,
      amountUSD: amountUSD.toFixed(2),
      amountMZN: quote.amountMZN,
      callbackUrl,
      status: 'PENDING',
      fxRateId: quote.fxRateId,
      expiresAt,
    },
  });

  await writeAudit({
    action: 'SESSION_CREATED',
    entityType: 'Session',
    entityId: session.id,
    actorId: merchantId,
    changes: { orderId, amountUSD: amountUSD.toFixed(2), amountMZN: quote.amountMZN },
  });

  return {
    sessionId: session.id,
    status: session.status,
    amountUSD: session.amountUSD.toString(),
    amountMZN: session.amountMZN.toString(),
    rate: quote.rate,
    checkoutUrl: `${cfg.CHECKOUT_BASE_URL}/checkout/${session.id}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface PublicSession {
  sessionId: string;
  status: string;
  orderId: string;
  merchantName: string;
  amountUSD: string;
  amountMZN: string;
  /** FX rate snapshot (USD→MZN) for "1 USD = X MZN". */
  rate: string;
  /** Service fee in MZN (already included in amountMZN, which is the total). */
  fee: string;
  expiresAt: string;
  expired: boolean;
}

/** Public, customer-facing view of a session (no internal fields). */
export async function getPublicSession(id: string): Promise<PublicSession> {
  const session = await prisma.session.findUnique({
    where: { id },
    include: { merchant: { select: { name: true } }, fxRate: true },
  });
  if (!session) {
    throw new NotFoundError('Session not found', { sessionId: id });
  }
  return {
    sessionId: session.id,
    status: session.status,
    orderId: session.orderId,
    merchantName: session.merchant.name,
    amountUSD: session.amountUSD.toFixed(2),
    amountMZN: session.amountMZN.toFixed(2),
    rate: session.fxRate ? session.fxRate.rate.toFixed(2) : '0.00',
    fee: session.fxRate ? session.fxRate.serviceFee.toFixed(2) : '0.00',
    expiresAt: session.expiresAt.toISOString(),
    expired: session.status === SessionStatus.PENDING && session.expiresAt.getTime() <= Date.now(),
  };
}

export interface ReturnTarget {
  terminal: boolean;
  /** Absolute merchant URL (terminal) or the checkout path (still in progress). */
  redirectUrl: string;
  status: string;
}

/**
 * Resolve where to send the customer's browser from the checkout (RF18). When
 * the session has reached a terminal outcome, redirect to the merchant's
 * callbackUrl carrying only `session` + `status` (no sensitive data — the
 * merchant verifies via webhook or GET /sessions/:id). Otherwise keep the
 * customer on the checkout page.
 */
export async function getReturnTarget(id: string): Promise<ReturnTarget> {
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
    throw new NotFoundError('Session not found', { sessionId: id });
  }

  const expired =
    session.status === SessionStatus.PENDING && session.expiresAt.getTime() <= Date.now();
  const status = expired ? SessionStatus.EXPIRED : session.status;
  const terminal =
    status === SessionStatus.COMPLETED ||
    status === SessionStatus.FAILED ||
    status === SessionStatus.EXPIRED;

  if (!terminal) {
    return { terminal: false, redirectUrl: `/checkout/${id}`, status };
  }

  const url = new URL(session.callbackUrl);
  url.searchParams.set('session', id);
  url.searchParams.set('status', status);
  return { terminal: true, redirectUrl: url.toString(), status };
}

/**
 * Validate a customer MSISDN against a session (RF04). The session must be
 * PENDING and not past its expiry. Returns the canonical MSISDN.
 */
export async function validatePhoneForSession(id: string, phone: unknown): Promise<string> {
  if (typeof phone !== 'string' || phone.length === 0) {
    throw new ValidationError('Phone is required');
  }
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) {
    throw new NotFoundError('Session not found', { sessionId: id });
  }
  if (session.status !== SessionStatus.PENDING) {
    throw new ConflictError('Session is not payable', { status: session.status });
  }
  if (session.expiresAt.getTime() <= Date.now()) {
    throw new ConflictError('Session has expired', { sessionId: id });
  }
  return normalizePhone(phone); // throws ValidationError on bad MSISDN
}
