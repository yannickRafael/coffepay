import { prisma, createLogger, NotFoundError, PaymentStatus } from '@coffepay/shared';
import { kycConfig } from './config.js';
import { assessBehaviour, type BehaviourSignals, type MonitorReason } from './monitor.rules.js';

const log = createLogger({ service: 'kyc-service', module: 'monitor' });

export interface ReassessResult {
  clientId: string;
  riskLevel: string;
  blacklisted: boolean;
  reasons: MonitorReason[];
  changed: boolean;
}

/**
 * Gather behavioural signals for a client over the configured window.
 * Amount comes from the linked session (Payment has no own amount). Isolated
 * so the data source can move to Transaction/LedgerEntry in T24.
 */
async function gatherSignals(clientId: string, windowStart: Date): Promise<BehaviourSignals> {
  const payments = await prisma.payment.findMany({
    where: { clientId, initiatedAt: { gte: windowStart } },
    select: { status: true, session: { select: { amountMZN: true } } },
  });

  let failedCount = 0;
  let accumulatedMZN = 0;
  for (const p of payments) {
    if (p.status === PaymentStatus.FAILED) failedCount++;
    if (p.status === PaymentStatus.SUCCESS) accumulatedMZN += Number(p.session.amountMZN);
  }
  return { count: payments.length, failedCount, accumulatedMZN };
}

/**
 * Passively reassess one client's risk (RF13): compute signals, apply rules,
 * persist the new risk level (and sticky blacklist), and audit only on change.
 */
export async function reassessClient(clientId: string): Promise<ReassessResult> {
  const profile = await prisma.kYCProfile.findUnique({ where: { clientId } });
  if (!profile) {
    throw new NotFoundError('KYC profile not found', { clientId });
  }

  const cfg = kycConfig();
  const windowStart = new Date(Date.now() - cfg.KYC_MONITOR_WINDOW_MS);
  const signals = await gatherSignals(clientId, windowStart);
  const assessment = assessBehaviour(signals, cfg);

  const nextBlacklisted = profile.isBlacklisted || assessment.blacklist; // sticky
  const changed =
    profile.riskLevel !== assessment.riskLevel || profile.isBlacklisted !== nextBlacklisted;

  await prisma.kYCProfile.update({
    where: { id: profile.id },
    data: {
      riskLevel: assessment.riskLevel,
      isBlacklisted: nextBlacklisted,
      lastValidatedAt: new Date(),
    },
  });

  if (changed) {
    await prisma.auditLog.create({
      data: {
        action: 'KYC_RISK_UPDATED',
        entityType: 'Client',
        entityId: clientId,
        changes: {
          from: { riskLevel: profile.riskLevel, isBlacklisted: profile.isBlacklisted },
          to: { riskLevel: assessment.riskLevel, isBlacklisted: nextBlacklisted },
          signals: {
            count: signals.count,
            failedCount: signals.failedCount,
            accumulatedMZN: signals.accumulatedMZN,
          },
          reasons: assessment.reasons,
        },
      },
    });
  }

  return {
    clientId,
    riskLevel: assessment.riskLevel,
    blacklisted: nextBlacklisted,
    reasons: assessment.reasons,
    changed,
  };
}

/**
 * Reassess every client with payment activity in the window. Returns the count
 * processed. Invoked by the repeatable monitor job.
 */
export async function runReassessmentSweep(): Promise<number> {
  const cfg = kycConfig();
  const windowStart = new Date(Date.now() - cfg.KYC_MONITOR_WINDOW_MS);
  const active = await prisma.payment.findMany({
    where: { initiatedAt: { gte: windowStart } },
    select: { clientId: true },
    distinct: ['clientId'],
  });

  let processed = 0;
  for (const { clientId } of active) {
    try {
      await reassessClient(clientId);
      processed++;
    } catch (err) {
      log.error({ clientId, err: (err as Error).message }, 'reassess failed');
    }
  }
  log.info({ processed }, 'reassessment sweep done');
  return processed;
}
