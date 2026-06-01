import { Router, type Request, type Response, type NextFunction } from 'express';
import { evaluateKyc } from './kyc.service.js';

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
