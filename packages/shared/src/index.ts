// @coffepay/shared — shared library.
export const SHARED_PACKAGE = '@coffepay/shared';

// Prisma: re-export generated types/enums + a lazy singleton client.
export * from '@prisma/client';
export { prisma } from './db.js';

// Base building blocks.
export { logger, createLogger } from './logger.js';
export * from './errors.js';
export { baseEnvSchema, loadEnv, type BaseEnv } from './config.js';
export { redis } from './redis.js';

// M-Pesa (Vodacom OpenAPI) client.
export * from './mpesa/index.js';

// Webhook HMAC signing/verification.
export {
  signPayload,
  verifySignature,
  parseSignatureHeader,
  SIGNATURE_HEADER,
  type SignedWebhook,
  type VerifyOptions,
} from './crypto/hmac.js';

// Password / secret hashing (bcrypt).
export { hashSecret, verifySecret } from './crypto/password.js';

// MSISDN normalization / hashing (Mozambique).
export { normalizePhone, isValidPhone, hashPhone } from './phone.js';

// Central audit logging (RNF07).
export { writeAudit, type AuditInput } from './audit.js';

// Periodic merchant settlement (thesis V2).
export {
  settleMerchant,
  runSettlements,
  merchantsWithPendingSettlement,
  type SettlementResult,
} from './settlement.js';

// Session state machine (RF02).
export { ALLOWED_TRANSITIONS, assertTransition, transitionSession } from './session-state.js';

// C2B result processing + authenticity (RF09/RF10).
export {
  processResult,
  type ProcessResultInput,
  type ProcessResultOutcome,
  type ResultRequestContext,
  type ProcessResultDeps,
  type NotifyFn,
} from './payment-result.js';

// BullMQ queues, DLQ and worker factory.
export * from './queue/index.js';
