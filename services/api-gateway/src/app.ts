import express, { type Request, type Response } from 'express';
import helmet from 'helmet';
import { requestId } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { apiKeyAuth } from './middleware/apiKeyAuth.js';
import { forward } from './middleware/forward.js';
import { buildAuthRouter } from './auth.routes.js';
import { buildAdminRouter } from './admin.routes.js';
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

  // API v1.
  const v1 = express.Router();
  v1.use('/auth', buildAuthRouter());

  // Create a session: authenticate by API key, forward to session-service.
  v1.post(
    '/sessions/create',
    apiKeyAuth,
    forward(cfg.SESSION_SERVICE_URL, '/sessions/create', 'post', cfg.UPSTREAM_TIMEOUT_MS),
  );

  app.use('/api/v1', v1);

  // Operational admin surface (DLQ inspect/reprocess — T34), admin-key protected.
  app.use('/admin', buildAdminRouter(cfg));

  app.use(errorHandler);
  return app;
}
