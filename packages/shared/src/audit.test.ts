import { randomUUID } from 'node:crypto';
import { prisma } from './db.js';
import { writeAudit } from './audit.js';

const ENTITY = randomUUID();

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: ENTITY } });
  await prisma.$disconnect();
});

describe('writeAudit (RNF07)', () => {
  test('writes a normalized audit row via the default client', async () => {
    await writeAudit({
      action: 'TEST_ACTION',
      entityType: 'Payment',
      entityId: ENTITY,
      changes: { foo: 'bar' },
    });
    const row = await prisma.auditLog.findFirst({
      where: { entityId: ENTITY, action: 'TEST_ACTION' },
    });
    expect(row).not.toBeNull();
    expect(row?.entityType).toBe('Payment');
    expect(row?.changes).toMatchObject({ foo: 'bar' });
    expect(row?.actorId).toBeNull();
  });

  test('records inside an interactive transaction when a tx client is passed', async () => {
    await prisma.$transaction(async (tx) => {
      await writeAudit(
        { action: 'TEST_TX', entityType: 'Transaction', entityId: ENTITY, transactionId: null },
        tx,
      );
    });
    const row = await prisma.auditLog.findFirst({
      where: { entityId: ENTITY, action: 'TEST_TX' },
    });
    expect(row).not.toBeNull();
  });
});
