import { Router, type Request, type Response, type NextFunction } from 'express';
import { listDeadLetters, reprocessDeadLetter, runSettlements, prisma } from '@coffepay/shared';
import { adminAuth } from './middleware/adminAuth.js';
import { gatewayConfig, type GatewayConfig } from './config.js';

/**
 * Operational admin routes (T34): inspect and reprocess dead-lettered jobs.
 * All routes require the admin key (adminAuth).
 */
export function buildAdminRouter(cfg: GatewayConfig = gatewayConfig()) {
  const router = Router();
  router.use(adminAuth(cfg.ADMIN_API_KEY));

  // List dead letters on a DLQ. ?start=&end= paginate.
  router.get('/dlq/:queue', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const start = req.query.start ? Number(req.query.start) : undefined;
      const end = req.query.end ? Number(req.query.end) : undefined;
      const items = await listDeadLetters(req.params.queue ?? '', { start, end });
      res.json({ queue: req.params.queue, count: items.length, items });
    } catch (err) {
      next(err);
    }
  });

  // Reprocess one dead letter: re-enqueue on its origin queue and remove it.
  router.post(
    '/dlq/:queue/:id/reprocess',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await reprocessDeadLetter(req.params.queue ?? '', req.params.id ?? '');
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  // Run the periodic settlement on-demand (T44): settle every merchant with
  // pending confirmed transactions.
  router.post('/settlements/run', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settlements = await runSettlements();
      res.json({ count: settlements.length, settlements });
    } catch (err) {
      next(err);
    }
  });

  // List settlements (optionally by merchant).
  router.get('/settlements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const merchantId =
        typeof req.query.merchantId === 'string' ? req.query.merchantId : undefined;
      const items = await prisma.settlement.findMany({
        where: merchantId ? { merchantId } : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json({ count: items.length, items });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
