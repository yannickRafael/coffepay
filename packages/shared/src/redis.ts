import { Redis } from 'ioredis';

// Single ioredis connection per process (reused across hot-reloads in dev).
const globalForRedis = globalThis as unknown as { redis?: Redis };

function create(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // Lazy: connect on first command, so merely importing @coffepay/shared does
  // not open a socket (keeps scripts/processes that don't use Redis exitable).
  return new Redis(url, { maxRetriesPerRequest: null, lazyConnect: true });
}

export const redis: Redis = globalForRedis.redis ?? create();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
