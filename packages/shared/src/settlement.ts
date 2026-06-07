import { Prisma, TransactionStatus, SettlementStatus } from '@prisma/client';
import { prisma } from './db.js';
import { ConflictError } from './errors.js';
import { writeAudit } from './audit.js';
import { createLogger } from './logger.js';

const log = createLogger({ module: 'settlement' });

export interface SettlementResult {
  settlementId: string;
  merchantId: string;
  amountMZN: string;
  amountUSD: string;
  feesDeducted: string;
  transactionCount: number;
}

/** Distinct merchants that have confirmed, not-yet-settled transactions. */
export async function merchantsWithPendingSettlement(): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { status: TransactionStatus.SUCCESS, settlementId: null },
    select: { payment: { select: { session: { select: { merchantId: true } } } } },
  });
  return [...new Set(rows.map((r) => r.payment.session.merchantId))];
}

/**
 * Settle all confirmed, not-yet-settled transactions for one merchant (T44):
 * aggregate the gross MZN, deduct the service fees, derive the net USD owed,
 * create the Settlement (mock payout = COMPLETED) and mark the transactions —
 * atomically. Idempotent: returns null when there is nothing to settle, and a
 * transaction can never join two settlements (Transaction.settlementId).
 *
 * Net merchant payout = sum(session.amountMZN) - sum(serviceFee); the equivalent
 * in USD is sum(session.amountUSD) (the FX base), so no external FX call is
 * needed at settlement time.
 */
export async function settleMerchant(
  merchantId: string,
  now: Date = new Date(),
): Promise<SettlementResult | null> {
  const txns = await prisma.transaction.findMany({
    where: {
      status: TransactionStatus.SUCCESS,
      settlementId: null,
      payment: { session: { merchantId } },
    },
    select: {
      id: true,
      createdAt: true,
      payment: {
        select: {
          session: {
            select: {
              amountMZN: true,
              amountUSD: true,
              fxRate: { select: { serviceFee: true } },
            },
          },
        },
      },
    },
  });
  if (txns.length === 0) return null;

  let grossMZN = new Prisma.Decimal(0);
  let fees = new Prisma.Decimal(0);
  let usd = new Prisma.Decimal(0);
  let periodStart = txns[0]!.createdAt;
  let periodEnd = txns[0]!.createdAt;
  for (const t of txns) {
    const s = t.payment.session;
    grossMZN = grossMZN.plus(s.amountMZN);
    fees = fees.plus(s.fxRate?.serviceFee ?? 0);
    usd = usd.plus(s.amountUSD);
    if (t.createdAt < periodStart) periodStart = t.createdAt;
    if (t.createdAt > periodEnd) periodEnd = t.createdAt;
  }
  const netMZN = grossMZN.minus(fees);
  const rate = usd.gt(0) ? netMZN.div(usd) : new Prisma.Decimal(0);
  const ids = txns.map((t) => t.id);

  const settlement = await prisma.$transaction(async (tx) => {
    const s = await tx.settlement.create({
      data: {
        merchantId,
        amountMZN: netMZN.toFixed(2),
        amountUSD: usd.toFixed(2),
        fxRate: rate.toFixed(6),
        feesDeducted: fees.toFixed(2),
        status: SettlementStatus.COMPLETED, // mock payout — no real USD rail
        periodStart,
        periodEnd,
        processedAt: now,
      },
    });
    // Claim only the still-unsettled rows (idempotent under a race).
    const claimed = await tx.transaction.updateMany({
      where: { id: { in: ids }, settlementId: null },
      data: { settlementId: s.id },
    });
    if (claimed.count === 0) {
      throw new ConflictError('Settlement race: transactions already settled', { merchantId });
    }
    return s;
  });

  await writeAudit({
    action: 'SETTLEMENT_PROCESSED',
    entityType: 'Settlement',
    entityId: settlement.id,
    changes: {
      merchantId,
      amountMZN: netMZN.toFixed(2),
      amountUSD: usd.toFixed(2),
      feesDeducted: fees.toFixed(2),
      transactionCount: ids.length,
    },
  });

  log.info(
    { merchantId, settlementId: settlement.id, amountUSD: usd.toFixed(2), count: ids.length },
    'settlement processed',
  );
  return {
    settlementId: settlement.id,
    merchantId,
    amountMZN: netMZN.toFixed(2),
    amountUSD: usd.toFixed(2),
    feesDeducted: fees.toFixed(2),
    transactionCount: ids.length,
  };
}

/** Settle every merchant with pending transactions. Returns the settlements made. */
export async function runSettlements(now: Date = new Date()): Promise<SettlementResult[]> {
  const merchants = await merchantsWithPendingSettlement();
  const out: SettlementResult[] = [];
  for (const m of merchants) {
    const r = await settleMerchant(m, now);
    if (r) out.push(r);
  }
  return out;
}
