import axios, { type Method } from 'axios';
import type { Request, Response, NextFunction } from 'express';
import { ProviderError } from '@coffepay/shared';

/**
 * Forward an authenticated request to a downstream service, injecting the
 * resolved merchantId and request id. The downstream trusts these headers
 * (internal network). Passes the upstream status/body straight back.
 */
export function forward(baseUrl: string, path: string, method: Method = 'post', timeout = 10_000) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const upstream = await axios.request({
        url: `${baseUrl}${path}`,
        method,
        data: req.body,
        params: req.query,
        timeout,
        validateStatus: () => true,
        headers: {
          'content-type': 'application/json',
          'x-merchant-id': req.merchantId ?? '',
          'x-request-id': req.id,
        },
      });
      res.status(upstream.status).json(upstream.data);
    } catch (err) {
      next(new ProviderError('Upstream service unavailable', { reason: (err as Error).message }));
    }
  };
}
