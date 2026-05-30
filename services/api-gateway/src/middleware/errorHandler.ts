import type { Request, Response, NextFunction } from 'express';
import { isAppError, logger } from '@coffepay/shared';

/** Central error handler: serialize AppError, hide internals otherwise. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const log = req.log ?? logger;
  if (isAppError(err)) {
    if (!err.isOperational) log.error({ err: err.message, code: err.code }, 'operational? no');
    res.status(err.httpStatus).json(err.toJSON());
    return;
  }
  log.error({ err: (err as Error)?.message }, 'unhandled error');
  res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
}
