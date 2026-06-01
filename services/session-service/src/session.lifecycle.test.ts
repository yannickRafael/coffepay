import {
  prisma,
  ConflictError,
  NotFoundError,
  SessionStatus,
  type SessionStatus as Status,
} from '@coffepay/shared';
import { assertTransition, transitionSession } from './session.state.js';
import { expireSessions } from './session.expiry.js';

const NUIT = 'TST16000001';
let merchantId: string;

beforeAll(async () => {
  const m = await prisma.merchant.create({
    data: { name: 'T16 Merchant', nuit: NUIT, status: 'ACTIVE' },
  });
  merchantId = m.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { merchantId } });
  await prisma.merchant.delete({ where: { id: merchantId } });
  await prisma.$disconnect();
});

let orderSeq = 0;
async function makeSession(status: Status, expiresAt: Date) {
  return prisma.session.create({
    data: {
      merchantId,
      orderId: `t16-${orderSeq++}`,
      amountUSD: '10.00',
      amountMZN: '635.00',
      callbackUrl: 'https://m.example/cb',
      status,
      expiresAt,
    },
  });
}

const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe('assertTransition', () => {
  test('allows legal transitions', () => {
    expect(() => assertTransition(SessionStatus.PENDING, SessionStatus.PROCESSING)).not.toThrow();
    expect(() => assertTransition(SessionStatus.PENDING, SessionStatus.EXPIRED)).not.toThrow();
    expect(() => assertTransition(SessionStatus.PROCESSING, SessionStatus.COMPLETED)).not.toThrow();
  });

  test('treats same-state as a no-op', () => {
    expect(() => assertTransition(SessionStatus.COMPLETED, SessionStatus.COMPLETED)).not.toThrow();
  });

  test('rejects illegal transitions', () => {
    expect(() => assertTransition(SessionStatus.PENDING, SessionStatus.COMPLETED)).toThrow(
      ConflictError,
    );
    expect(() => assertTransition(SessionStatus.COMPLETED, SessionStatus.PENDING)).toThrow(
      ConflictError,
    );
    expect(() => assertTransition(SessionStatus.EXPIRED, SessionStatus.PROCESSING)).toThrow(
      ConflictError,
    );
  });
});

describe('transitionSession', () => {
  test('persists a legal transition and writes an audit log', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    const updated = await transitionSession(s.id, SessionStatus.PROCESSING, merchantId);
    expect(updated.status).toBe(SessionStatus.PROCESSING);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Session', entityId: s.id, action: 'SESSION_PROCESSING' },
    });
    expect(log).not.toBeNull();
    expect(log?.actorId).toBe(merchantId);
  });

  test('is idempotent when already in the target state', async () => {
    const s = await makeSession(SessionStatus.COMPLETED, future());
    const same = await transitionSession(s.id, SessionStatus.COMPLETED);
    expect(same.status).toBe(SessionStatus.COMPLETED);
  });

  test('rejects an illegal transition', async () => {
    const s = await makeSession(SessionStatus.PENDING, future());
    await expect(transitionSession(s.id, SessionStatus.COMPLETED)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  test('throws NotFoundError for an unknown session', async () => {
    await expect(
      transitionSession('00000000-0000-0000-0000-000000000000', SessionStatus.PROCESSING),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('expireSessions', () => {
  test('expires only past-due PENDING sessions', async () => {
    const stale = await makeSession(SessionStatus.PENDING, past());
    const fresh = await makeSession(SessionStatus.PENDING, future());
    const done = await makeSession(SessionStatus.COMPLETED, past());

    const count = await expireSessions();
    expect(count).toBeGreaterThanOrEqual(1);

    expect((await prisma.session.findUnique({ where: { id: stale.id } }))?.status).toBe(
      SessionStatus.EXPIRED,
    );
    expect((await prisma.session.findUnique({ where: { id: fresh.id } }))?.status).toBe(
      SessionStatus.PENDING,
    );
    expect((await prisma.session.findUnique({ where: { id: done.id } }))?.status).toBe(
      SessionStatus.COMPLETED,
    );

    const log = await prisma.auditLog.findFirst({
      where: { entityType: 'Session', entityId: stale.id, action: 'SESSION_EXPIRED' },
    });
    expect(log).not.toBeNull();
  });

  test('is idempotent on a second sweep', async () => {
    await makeSession(SessionStatus.PENDING, past());
    await expireSessions();
    const second = await expireSessions();
    expect(second).toBe(0);
  });
});
