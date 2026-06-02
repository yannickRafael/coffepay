import { Router, type Request, type Response, type NextFunction } from 'express';
import { evaluateKyc } from './kyc.service.js';
import { reassessClient } from './kyc.monitor.js';

export const kycRouter = Router();

// Active KYC/AML check (RF12). Returns 200 with the decision; the caller
// (payment flow) enforces `allowed`.
kycRouter.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await evaluateKyc(req.body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Passive reassessment trigger (RF13) — manual/demo; the scheduler runs it
// automatically. Returns 200 with the new risk state.
kycRouter.post('/reassess/:clientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await reassessClient(req.params.clientId ?? '');
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});
