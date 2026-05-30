import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthError } from '@coffepay/shared';

export interface MerchantTokenClaims {
  type?: string;
}

/** Issue a short-lived JWT for a merchant (sub = merchantId). */
export function signMerchantToken(
  merchantId: string,
  claims: MerchantTokenClaims,
  secret: string,
  expiresIn: string,
): string {
  return jwt.sign(claims, secret, { subject: merchantId, expiresIn: expiresIn as never });
}

/** Middleware factory: verify a Bearer JWT and set req.merchantId. */
export function jwtAuth(secret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ')) throw new AuthError('Missing bearer token');
      const payload = jwt.verify(auth.slice(7).trim(), secret);
      if (typeof payload === 'string' || !payload.sub) throw new AuthError('Invalid token');
      req.merchantId = String(payload.sub);
      next();
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
        next(new AuthError('Invalid or expired token'));
        return;
      }
      next(err);
    }
  };
}
