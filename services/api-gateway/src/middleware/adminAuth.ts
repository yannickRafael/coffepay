import type { Request, Response, NextFunction } from 'express';
import { AuthError } from '@coffepay/shared';

/**
 * Guard operational/admin endpoints with a static admin key (X-Admin-Key).
 * If no key is configured, the admin surface is closed (every request is
 * rejected) rather than left open.
 */
export function adminAuth(expectedKey: string | undefined) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const provided = req.headers['x-admin-key'];
    if (!expectedKey || typeof provided !== 'string' || provided !== expectedKey) {
      next(new AuthError('Admin access denied'));
      return;
    }
    next();
  };
}
