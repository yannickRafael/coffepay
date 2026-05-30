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

// BullMQ queues, DLQ and worker factory.
export * from './queue/index.js';
