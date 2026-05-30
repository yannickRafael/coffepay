import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { gatewayConfig, type GatewayConfig } from './config.js';

export function createApp(cfg: GatewayConfig = gatewayConfig()) {
  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: cfg.JSON_LIMIT }));
  app.use(requestId);

  // Health is not rate-limited.
  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));

  app.use(createRateLimiter({ windowMs: cfg.RATE_LIMIT_WINDOW_MS, max: cfg.RATE_LIMIT_MAX }));

  // API v1. Auth (T14) and business routes (sessions T15, pay T20) mount here.
  const v1 = express.Router();
  app.use('/api/v1', v1);

  app.use(errorHandler);
  return app;
}
