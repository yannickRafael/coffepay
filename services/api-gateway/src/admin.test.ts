import request from 'supertest';
import { QUEUE_NAMES, closeQueues } from '@coffepay/shared';
import { createApp } from './app.js';
import { gatewayConfig } from './config.js';

const ADMIN_KEY = 'admin-test-key';
const app = createApp({ ...gatewayConfig(), ADMIN_API_KEY: ADMIN_KEY });

afterAll(async () => {
  await closeQueues();
});

describe('admin DLQ routes (T34)', () => {
  test('rejects requests without the admin key (401)', async () => {
    const res = await request(app).get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`);
    expect(res.status).toBe(401);
  });

  test('rejects a wrong admin key (401)', async () => {
    const res = await request(app)
      .get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`)
      .set('X-Admin-Key', 'nope');
    expect(res.status).toBe(401);
  });

  test('lists dead letters with the admin key (200)', async () => {
    const res = await request(app)
      .get(`/admin/dlq/${QUEUE_NAMES.paymentProcessDlq}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.queue).toBe(QUEUE_NAMES.paymentProcessDlq);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('rejects an unknown queue name (400)', async () => {
    const res = await request(app).get('/admin/dlq/not-a-queue').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });
});
