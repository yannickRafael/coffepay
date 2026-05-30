import type { Request, Response, NextFunction } from 'express';
import { prisma, verifySecret, AuthError, ForbiddenError } from '@coffepay/shared';

/** Extract the raw API key from "X-Api-Key" or "Authorization: ApiKey <key>". */
function extractApiKey(req: Request): string | undefined {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey) return headerKey;
  const auth = req.headers.authorization;
  if (auth?.startsWith('ApiKey ')) return auth.slice(7).trim();
  return undefined;
}

/**
 * Authenticate a merchant by API key. The raw key is bcrypt-compared against
 * active keys (small set in this prototype). Sets req.merchantId / apiKeyId.
 */
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const raw = extractApiKey(req);
    if (!raw) throw new AuthError('Missing API key');

    const keys = await prisma.apiKey.findMany({
      where: { isActive: true },
      include: { merchant: true },
    });

    let matched: (typeof keys)[number] | undefined;
    for (const key of keys) {
      if (await verifySecret(raw, key.keyHash)) {
        matched = key;
        break;
      }
    }
    if (!matched) throw new AuthError('Invalid API key');
    if (matched.merchant.status !== 'ACTIVE') throw new ForbiddenError('Merchant not active');

    req.merchantId = matched.merchantId;
    req.apiKeyId = matched.id;
    next();
  } catch (err) {
    next(err);
  }
}
