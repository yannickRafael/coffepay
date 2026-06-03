import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  ValidationError,
  processResult,
  MPESA_SUCCESS_CODE,
  type MpesaResult,
} from '@coffepay/shared';

export const callbackRouter = Router();

// Vodacom-style result callback. In ADR-001 sync mode the worker is the primary
// path; this endpoint exists for compatibility and reuses the same handler
// (authenticity verified by processResult against the stored ProviderRequest).
const callbackSchema = z.object({
  paymentId: z.string().uuid(),
  output_ResponseCode: z.string().min(1),
  output_ResponseDesc: z.string().optional(),
  output_TransactionID: z.string().optional(),
  output_ThirdPartyReference: z.string().min(1),
});

callbackRouter.post('/mpesa', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = callbackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid callback payload', parsed.error.flatten());
    }
    const d = parsed.data;
    const result: MpesaResult = {
      success: d.output_ResponseCode === MPESA_SUCCESS_CODE,
      code: d.output_ResponseCode,
      message: d.output_ResponseDesc,
      transactionId: d.output_TransactionID,
      thirdPartyReference: d.output_ThirdPartyReference,
      raw: d,
    };
    const outcome = await processResult({ paymentId: d.paymentId, result });
    res.status(200).json(outcome);
  } catch (err) {
    next(err);
  }
});
