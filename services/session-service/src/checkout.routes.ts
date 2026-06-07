import { Router, type Request, type Response, type NextFunction } from 'express';
import { isAppError } from '@coffepay/shared';
import { getPublicSession, getReturnTarget } from './session.service.js';
import { renderCheckoutPage, renderStatePage, renderNotFound } from './checkout.view.js';
import { sessionConfig } from './config.js';

export const checkoutRouter = Router();

// Return-to-merchant redirect (RF18). Terminal session → 302 to the merchant's
// callbackUrl with ?session=&status=; still in progress → back to the checkout.
// Declared before '/:id' so the more specific path wins.
checkoutRouter.get('/:id/return', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const target = await getReturnTarget(req.params.id ?? '');
    res.redirect(302, target.redirectUrl);
  } catch (err) {
    if (isAppError(err) && err.httpStatus === 404) {
      res.status(404).type('html').send(renderNotFound());
      return;
    }
    next(err);
  }
});

// Server-rendered checkout page (RF03). Shows the form for a payable session,
// otherwise an informational state page; 404 (HTML) for unknown sessions.
checkoutRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await getPublicSession(req.params.id ?? '');
    const payable = session.status === 'PENDING' && !session.expired;
    const cfg = sessionConfig();
    const html = payable
      ? renderCheckoutPage(session, {
          pollIntervalMs: cfg.CHECKOUT_POLL_INTERVAL_MS,
          pollTimeoutMs: cfg.CHECKOUT_POLL_TIMEOUT_MS,
        })
      : renderStatePage(session);
    res.status(200).type('html').send(html);
  } catch (err) {
    if (isAppError(err) && err.httpStatus === 404) {
      res.status(404).type('html').send(renderNotFound());
      return;
    }
    next(err);
  }
});
