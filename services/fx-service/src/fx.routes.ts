import { Router, type Request, type Response, type NextFunction } from 'express';
import { quote, refreshRate } from './fx.service.js';

export const fxRouter = Router();

// GET /fx/quote?amount=100  → conversion + persisted FXRate snapshot
fxRouter.get('/quote', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const amount = req.query.amount as string | undefined;
    const result = await quote(amount ?? '');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /fx/refresh  → force a provider refresh (overwrites cache)
fxRouter.post('/refresh', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rate = await refreshRate();
    res.json({ rate });
  } catch (err) {
    next(err);
  }
});
