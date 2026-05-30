import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '@coffepay/shared';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  /** Optional key function (e.g. per merchant). Defaults to IP. */
  keyGenerator?: (req: Request) => string;
}

/** Build an express-rate-limit middleware that surfaces a RateLimitError. */
export function createRateLimiter(cfg: RateLimitConfig) {
  return rateLimit({
    windowMs: cfg.windowMs,
    max: cfg.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: cfg.keyGenerator,
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitError('Too many requests'));
    },
  });
}
