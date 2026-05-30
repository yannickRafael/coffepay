import express, { type Request, type Response, type NextFunction } from 'express';
import { isAppError, createLogger } from '@coffepay/shared';
import { fxRouter } from './fx.routes.js';

const log = createLogger({ service: 'fx-service' });

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.use('/fx', fxRouter);

  // Central error handler: serialize AppError, hide internals otherwise.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isAppError(err)) {
      res.status(err.httpStatus).json(err.toJSON());
      return;
    }
    log.error({ err: (err as Error).message }, 'unhandled error');
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  return app;
}
