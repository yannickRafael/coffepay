import {
  prisma,
  verifySignature,
  SIGNATURE_HEADER,
  type MerchantNotifyJob,
} from '@coffepay/shared';
import { processNotifyJob, type PostFn } from './notify.worker.js';
import { notificationConfig } from './config.js';

// One merchant with three webhooks: active (subscribed), active (other events),
// and inactive. Covers delivery, signing, retry signal and subscription filtering.
let merchantId: string;
let activeWebhookId: string;
let otherEventsWebhookId: string;
let inactiveWebhookId: string;

const SECRET = () => notificationConfig().WEBHOOK_SIGNING_SECRET;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T25b Merchant', nuit: `TST25B${Date.now()}`, status: 'ACTIVE' },
  });
  merchantId = m.id;

  const active = await prisma.webhook.create({
    data: {
      merchantId,
      url: 'https://m.example/hook',
      events: 'payment.success,payment.failed',
      isActive: true,
    },
  });
  activeWebhookId = active.id;

  const other = await prisma.webhook.create({
    data: {
      merchantId,
      url: 'https://m.example/other',
      events: 'payment.refunded',
      isActive: true,
    },
  });
  otherEventsWebhookId = other.id;

  const inactive = await prisma.webhook.create({
    data: {
      merchantId,
      url: 'https://m.example/dead',
      events: 'payment.success',
      isActive: false,
    },
  });
  inactiveWebhookId = inactive.id;
});

afterAll(async () => {
  // Cascade removes webhooks; audit rows are left (no FK) and are test-scoped by id.
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Webhook', entityId: { in: [activeWebhookId, otherEventsWebhookId] } },
  });
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

function job(webhookId: string, event = 'payment.success'): MerchantNotifyJob {
  return {
    webhookId,
    merchantId,
    url: 'https://m.example/hook',
    event,
    payload: { event, paymentId: 'pay-1', status: 'SUCCESS', amount: '635.00' },
  };
}

// Records every POST so tests can inspect what was actually sent (and signed).
interface Recorded {
  url: string;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}
function recordingPost(status = 200) {
  const calls: Recorded[] = [];
  const post: PostFn = async (url, body, headers, timeoutMs) => {
    calls.push({ url, body, headers, timeoutMs });
    return { status };
  };
  return { post, calls };
}

describe('processNotifyJob', () => {
  test('2xx delivery: POSTs a valid HMAC-signed body and audits WEBHOOK_DELIVERED', async () => {
    const { post, calls } = recordingPost(200);

    const out = await processNotifyJob(job(activeWebhookId), { post });

    expect(out).toMatchObject({ webhookId: activeWebhookId, delivered: true, status: 200 });
    expect(calls).toHaveLength(1);

    // POST hit the webhook's stored URL with the right timeout.
    const sent = calls[0]!;
    expect(sent.url).toBe('https://m.example/hook');
    expect(sent.timeoutMs).toBe(notificationConfig().NOTIFY_REQUEST_TIMEOUT_MS);

    // Signature header is present and verifies against the exact body sent.
    const header = sent.headers[SIGNATURE_HEADER];
    expect(header).toBeDefined();
    expect(verifySignature(sent.body, header!, SECRET())).toBe(true);

    // Audit trail recorded for this webhook.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'WEBHOOK_DELIVERED', entityType: 'Webhook', entityId: activeWebhookId },
    });
    expect(audit).not.toBeNull();
  });

  test('tampered body fails verification (HMAC binds the exact payload)', async () => {
    const { post, calls } = recordingPost(200);
    await processNotifyJob(job(activeWebhookId), { post });

    const { body, headers } = calls[0]!;
    const tampered = body.replace('635.00', '999.99');
    expect(verifySignature(tampered, headers[SIGNATURE_HEADER]!, SECRET())).toBe(false);
  });

  test('non-2xx / timeout: processor throws so BullMQ retries (then DLQ)', async () => {
    const failingPost: PostFn = async () => {
      throw new Error('Request failed with status code 502');
    };
    await expect(processNotifyJob(job(activeWebhookId), { post: failingPost })).rejects.toThrow();
  });

  test('inactive webhook: skipped, no POST', async () => {
    const { post, calls } = recordingPost(200);
    const out = await processNotifyJob(job(inactiveWebhookId), { post });
    expect(out).toMatchObject({ delivered: false, skipped: true });
    expect(calls).toHaveLength(0);
  });

  test('event not subscribed: skipped, no POST', async () => {
    const { post, calls } = recordingPost(200);
    // otherEventsWebhook only subscribes payment.refunded; send payment.success.
    const out = await processNotifyJob(job(otherEventsWebhookId, 'payment.success'), { post });
    expect(out).toMatchObject({ delivered: false, skipped: true });
    expect(calls).toHaveLength(0);
  });

  test('missing webhook: skipped, no POST', async () => {
    const { post, calls } = recordingPost(200);
    const out = await processNotifyJob(job('00000000-0000-0000-0000-000000000000'), { post });
    expect(out).toMatchObject({ delivered: false, skipped: true });
    expect(calls).toHaveLength(0);
  });
});
