import { Router, type Request, type Response, type NextFunction } from 'express';
import { isAppError } from '@coffepay/shared';
import { getPublicSession } from './session.service.js';
import { renderCheckoutPage, renderStatePage, renderNotFound } from './checkout.view.js';

export const checkoutRouter = Router();

// Server-rendered checkout page (RF03). Shows the form for a payable session,
// otherwise an informational state page; 404 (HTML) for unknown sessions.
checkoutRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await getPublicSession(req.params.id ?? '');
    const payable = session.status === 'PENDING' && !session.expired;
    const html = payable ? renderCheckoutPage(session) : renderStatePage(session);
    res.status(200).type('html').send(html);
  } catch (err) {
    if (isAppError(err) && err.httpStatus === 404) {
      res.status(404).type('html').send(renderNotFound());
      return;
    }
    next(err);
  }
});
