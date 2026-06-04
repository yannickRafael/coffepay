import axios from 'axios';
import {
  prisma,
  createLogger,
  createWorker,
  signPayload,
  SIGNATURE_HEADER,
  QUEUE_NAMES,
  type MerchantNotifyJob,
} from '@coffepay/shared';
import type { Worker } from 'bullmq';
import { notificationConfig } from './config.js';

const log = createLogger({ service: 'notification-service', module: 'worker' });

export interface PostResponse {
  status: number;
}
export type PostFn = (
  url: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
) => Promise<PostResponse>;

export interface NotifyWorkerDeps {
  post?: PostFn;
}

export interface NotifyOutcome {
  webhookId: string;
  delivered: boolean;
  skipped?: boolean;
  status?: number;
}

const defaultPost: PostFn = async (url, body, headers, timeoutMs) => {
  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json', ...headers },
    timeout: timeoutMs,
    // Only 2xx counts as delivered; anything else throws → retry.
    validateStatus: (s) => s >= 200 && s < 300,
    transformRequest: [(d) => d], // body is already a JSON string; sign exactly what we send
  });
  return { status: res.status };
};

/**
 * Deliver one merchant webhook (RF15) reliably (RF17). Resolves the webhook,
 * signs the body (HMAC), POSTs it; non-2xx/timeout throws so BullMQ retries
 * (then DLQ). Inactive webhook or unsubscribed event is a no-op.
 */
export async function processNotifyJob(
  job: MerchantNotifyJob,
  deps: NotifyWorkerDeps = {},
): Promise<NotifyOutcome> {
  const post = deps.post ?? defaultPost;
  const cfg = notificationConfig();

  const webhook = await prisma.webhook.findUnique({ where: { id: job.webhookId } });
  if (!webhook || !webhook.isActive) {
    log.warn({ webhookId: job.webhookId }, 'webhook missing/inactive; skipping');
    return { webhookId: job.webhookId, delivered: false, skipped: true };
  }
  const events = webhook.events.split(',').map((e) => e.trim());
  if (events.length > 0 && !events.includes(job.event)) {
    log.info({ webhookId: job.webhookId, event: job.event }, 'event not subscribed; skipping');
    return { webhookId: job.webhookId, delivered: false, skipped: true };
  }

  const body = JSON.stringify(job.payload);
  const signed = signPayload(body, cfg.WEBHOOK_SIGNING_SECRET);

  // Throws on non-2xx / network / timeout → BullMQ retry → DLQ.
  const res = await post(
    webhook.url,
    body,
    { [SIGNATURE_HEADER]: signed.header },
    cfg.NOTIFY_REQUEST_TIMEOUT_MS,
  );

  await prisma.auditLog.create({
    data: {
      action: 'WEBHOOK_DELIVERED',
      entityType: 'Webhook',
      entityId: webhook.id,
      changes: { event: job.event, url: webhook.url, status: res.status },
    },
  });

  log.info({ webhookId: webhook.id, event: job.event, status: res.status }, 'webhook delivered');
  return { webhookId: webhook.id, delivered: true, status: res.status };
}

/** Start the BullMQ worker consuming the merchant-notify queue. */
export function startNotifyWorker(deps: NotifyWorkerDeps = {}): Worker<MerchantNotifyJob> {
  const { NOTIFY_WORKER_CONCURRENCY } = notificationConfig();
  return createWorker<MerchantNotifyJob>(
    QUEUE_NAMES.merchantNotify,
    async (job) => processNotifyJob(job.data, deps),
    { concurrency: NOTIFY_WORKER_CONCURRENCY },
  );
}
