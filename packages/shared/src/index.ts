// @coffepay/shared — shared library.
// Logger, errors and config land in T05.
export const SHARED_PACKAGE = '@coffepay/shared';

// Prisma: re-export generated types/enums + a lazy singleton client.
export * from '@prisma/client';
export { prisma } from './db.js';
