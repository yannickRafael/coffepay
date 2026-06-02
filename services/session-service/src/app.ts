import express, { type Request, type Response, type NextFunction } from 'express';
import { isAppError, createLogger } from '@coffepay/shared';
import { sessionRouter } from './session.routes.js';
import { checkoutRouter } from './checkout.routes.js';

const log = createLogger({ service: 'session-service' });

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // checkout form posts

  app.get('/health', (_req: Request, res: Response) => res.json({ status: 'ok' }));
  app.use('/sessions', sessionRouter);
  app.use('/checkout', checkoutRouter);

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
