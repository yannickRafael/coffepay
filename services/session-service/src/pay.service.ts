import { randomUUID } from 'node:crypto';
import {
  prisma,
  ForbiddenError,
  SessionStatus,
  hashPhone,
  enqueuePayment,
  type PaymentJob,
} from '@coffepay/shared';
import { sessionConfig } from './config.js';
import { validatePhoneForSession } from './session.service.js';
import { transitionSession } from './session.state.js';
import { checkKyc, type KycCheckFn } from './kyc.client.js';

export interface PayResult {
  paymentId: string;
  sessionId: string;
  status: string;
}

export interface ConfirmPaymentDeps {
  kycCheck?: KycCheckFn;
  enqueue?: (job: PaymentJob) => Promise<unknown>;
}

/**
 * Confirm a session payment (RF05) idempotently (RF14): validate the phone,
 * run active KYC, create the Payment + IdempotencyKey, move the session to
 * PROCESSING and enqueue the C2B job (executed by the worker in T21).
 */
export async function confirmPayment(
  sessionId: string,
  phone: unknown,
  idempotencyKey: string | undefined,
  deps: ConfirmPaymentDeps = {},
): Promise<PayResult> {
  const kycCheck = deps.kycCheck ?? checkKyc;
  const enqueue = deps.enqueue ?? ((job: PaymentJob) => enqueuePayment(job));
  const cfg = sessionConfig();

  const key = idempotencyKey && idempotencyKey.length > 0 ? idempotencyKey : `session:${sessionId}`;

  // Idempotent replay first (RF14): a known key returns its stored result
  // unchanged, regardless of the session's current state.
  const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
  if (existing?.result) {
    return existing.result as unknown as PayResult;
  }

  // Validates session is PENDING + not expired and returns the canonical MSISDN.
  const msisdn = await validatePhoneForSession(sessionId, phone);

  // Active KYC/AML gate (RF12).
  const session = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
  const kyc = await kycCheck(msisdn, session.amountMZN.toFixed(2));
  if (!kyc.allowed) {
    throw new ForbiddenError('Payment blocked by KYC/AML', { reasons: kyc.reasons });
  }

  const client = await prisma.client.upsert({
    where: { phoneHash: hashPhone(msisdn) },
    create: { phoneHash: hashPhone(msisdn) },
    update: {},
  });

  const payment = await prisma.payment.create({
    data: {
      sessionId,
      clientId: client.id,
      idempotencyKey: key,
      status: 'INITIATED',
    },
  });

  await transitionSession(sessionId, SessionStatus.PROCESSING);

  const result: PayResult = { paymentId: payment.id, sessionId, status: SessionStatus.PROCESSING };

  await prisma.idempotencyKey.create({
    data: {
      key,
      paymentId: payment.id,
      result: { ...result },
      expiresAt: new Date(Date.now() + cfg.IDEMPOTENCY_TTL_SECONDS * 1000),
    },
  });

  const job: PaymentJob = {
    paymentId: payment.id,
    sessionId,
    msisdn,
    amountMZN: session.amountMZN.toFixed(2),
    reference: payment.id.slice(0, 18),
    thirdPartyReference: randomUUID().slice(0, 18),
  };
  await enqueue(job);

  return result;
}
