import { Router, type Request, type Response } from 'express';
import { apiKeyAuth } from './middleware/apiKeyAuth.js';
import { jwtAuth, signMerchantToken } from './middleware/jwtAuth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { gatewayConfig } from './config.js';

export function buildAuthRouter() {
  const cfg = gatewayConfig();
  const router = Router();

  // Exchange an API key for a short-lived JWT.
  router.post('/token', apiKeyAuth, (req: Request, res: Response) => {
    const token = signMerchantToken(
      req.merchantId as string,
      { type: 'merchant' },
      cfg.JWT_SECRET,
      cfg.JWT_EXPIRES_IN,
    );
    res.json({ token, tokenType: 'Bearer', expiresIn: cfg.JWT_EXPIRES_IN });
  });

  // Example protected route: JWT + per-merchant rate limit.
  const perMerchant = createRateLimiter({
    windowMs: cfg.MERCHANT_RATE_LIMIT_WINDOW_MS,
    max: cfg.MERCHANT_RATE_LIMIT_MAX,
    keyGenerator: (req: Request) => req.merchantId ?? req.ip ?? 'anon',
  });
  router.get('/me', jwtAuth(cfg.JWT_SECRET), perMerchant, (req: Request, res: Response) => {
    res.json({ merchantId: req.merchantId });
  });

  return router;
}
