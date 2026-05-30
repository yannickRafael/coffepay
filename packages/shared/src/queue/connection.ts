import type { ConnectionOptions } from 'bullmq';

/**
 * Build BullMQ connection options from REDIS_URL. We pass options (not an
 * ioredis instance) so BullMQ instantiates its own bundled ioredis — avoids
 * type clashes between the app's ioredis and BullMQ's pinned copy.
 * maxRetriesPerRequest: null is required by BullMQ.
 */
export function connectionOptions(): ConnectionOptions {
  const u = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
