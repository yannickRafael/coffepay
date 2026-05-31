import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthError } from '@coffepay/shared';
import { createSession } from './session.service.js';

export const sessionRouter = Router();

// merchantId is injected by the gateway after authentication.
function requireMerchant(req: Request): string {
  const merchantId = req.headers['x-merchant-id'];
  if (typeof merchantId !== 'string' || !merchantId) {
    throw new AuthError('Missing merchant context');
  }
  return merchantId;
}

sessionRouter.post('/create', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const merchantId = requireMerchant(req);
    const result = await createSession(req.body, merchantId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});
