import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '@coffepay/shared';

type ReqLogger = ReturnType<typeof createLogger>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: ReqLogger;
    }
  }
}

/** Attach a request id (reusing inbound X-Request-Id) and a child logger. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  req.log = createLogger({ requestId: id });
  next();
}
