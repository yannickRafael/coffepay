import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthError } from '@coffepay/shared';
import { createSession, getPublicSession, validatePhoneForSession } from './session.service.js';
import { confirmPayment } from './pay.service.js';

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

// Public session view for the checkout client (no merchant auth, no internals).
sessionRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getPublicSession(req.params.id ?? '');
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// Validate the customer MSISDN against the session (RF04).
sessionRouter.post(
  '/:id/validate-phone',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const msisdn = await validatePhoneForSession(req.params.id ?? '', req.body?.phone);
      res.status(200).json({ valid: true, msisdn });
    } catch (err) {
      next(err);
    }
  },
);

// Confirm payment (RF05) idempotently (RF14). Async: enqueues the C2B job.
sessionRouter.post('/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idempotencyKey =
      typeof req.headers['idempotency-key'] === 'string'
        ? req.headers['idempotency-key']
        : undefined;
    const result = await confirmPayment(req.params.id ?? '', req.body?.phone, idempotencyKey);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});
