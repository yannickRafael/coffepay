import axios, { isAxiosError } from 'axios';
import { createLogger } from '../logger.js';
import { ProviderError, TimeoutError, ValidationError } from '../errors.js';
import { loadMpesaConfig, isMockMode, type MpesaEnv } from './config.js';
import { buildBearerToken } from './session.js';
import { mpesaUrl } from './endpoints.js';
import {
  MPESA_SUCCESS_CODE,
  type C2BParams,
  type QueryParams,
  type ReversalParams,
  type MpesaResult,
  type MpesaRawResponse,
} from './types.js';

const log = createLogger({ module: 'mpesa-client' });

/**
 * Validate and normalize a Mozambican MSISDN to 258XXXXXXXXX.
 * Accepts 84/85 numbers as 9 digits or already prefixed with 258.
 */
export function normalizeMsisdn(raw: string): string {
  const digits = (raw ?? '').replace(/[\s+]/g, '');
  if (/^258(84|85)\d{7}$/.test(digits)) return digits;
  if (/^(84|85)\d{7}$/.test(digits)) return `258${digits}`;
  throw new ValidationError('Invalid MSISDN (expected Vodacom 84/85 number)', { msisdn: raw });
}

function assertAmount(amount: number | string): string {
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Invalid amount', { amount });
  }
  return n.toFixed(2);
}

function normalize(raw: MpesaRawResponse): MpesaResult {
  return {
    success: raw.output_ResponseCode === MPESA_SUCCESS_CODE,
    code: raw.output_ResponseCode,
    message: raw.output_ResponseDesc,
    transactionId: raw.output_TransactionID,
    conversationId: raw.output_ConversationID,
    thirdPartyReference: raw.output_ThirdPartyReference,
    raw,
  };
}

function toAppError(err: unknown, op: string): never {
  if (isAxiosError(err)) {
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      throw new TimeoutError(`M-Pesa ${op} timed out`);
    }
    // err.response present => HTTP error; absent => network/TLS error.
    throw new ProviderError(`M-Pesa ${op} failed`, {
      status: err.response?.status,
      netCode: err.code, // ENOTFOUND, ECONNREFUSED, EPROTO, DEPTH_ZERO_SELF_SIGNED_CERT…
      reason: err.message,
      cause: (err.cause as { code?: string } | undefined)?.code,
      code: err.response?.data?.output_ResponseCode,
      desc: err.response?.data?.output_ResponseDesc ?? err.response?.data?.fault?.faultstring,
      body: err.response?.data,
    });
  }
  throw new ProviderError(`M-Pesa ${op} failed`, { reason: (err as Error)?.message });
}

function headers(cfg: MpesaEnv) {
  return {
    'Content-Type': 'application/json',
    Origin: cfg.MPESA_ORIGIN,
    Authorization: buildBearerToken(cfg),
  };
}

// ----------------------------- Mock --------------------------------
// Deterministic so tests/dev are reproducible: a normalized MSISDN ending in
// 9 is declined; everything else succeeds.
function mockC2B(p: C2BParams, msisdn: string): MpesaResult {
  const declined = msisdn.endsWith('9');
  return normalize({
    output_ResponseCode: declined ? 'INS-996' : MPESA_SUCCESS_CODE,
    output_ResponseDesc: declined
      ? 'Transaction declined (mock)'
      : 'Request processed successfully',
    output_TransactionID: declined ? undefined : `MOCK${p.reference}`,
    output_ConversationID: `MOCKCONV${p.reference}`,
    output_ThirdPartyReference: p.thirdPartyReference,
  });
}

// ----------------------------- Operations --------------------------

/** C2B single-stage payment (customer pays merchant; PIN prompt on device). */
export async function c2bPayment(
  params: C2BParams,
  cfg: MpesaEnv = loadMpesaConfig(),
): Promise<MpesaResult> {
  const msisdn = normalizeMsisdn(params.msisdn);
  const amount = assertAmount(params.amount);
  if (!params.reference) throw new ValidationError('Missing reference');
  if (!params.thirdPartyReference) throw new ValidationError('Missing thirdPartyReference');

  if (isMockMode(cfg)) return mockC2B(params, msisdn);

  try {
    const res = await axios.post<MpesaRawResponse>(
      mpesaUrl(cfg, 'c2b'),
      {
        input_ServiceProviderCode: cfg.MPESA_SERVICE_PROVIDER_CODE,
        input_CustomerMSISDN: msisdn,
        input_Amount: amount,
        input_TransactionReference: params.reference,
        input_ThirdPartyReference: params.thirdPartyReference,
      },
      { timeout: cfg.MPESA_REQUEST_TIMEOUT_MS, headers: headers(cfg) },
    );
    log.info({ ref: params.reference, code: res.data.output_ResponseCode }, 'C2B response');
    return normalize(res.data);
  } catch (err) {
    return toAppError(err, 'c2bPayment');
  }
}

/** Query the status of a previous transaction. */
export async function queryTransactionStatus(
  params: QueryParams,
  cfg: MpesaEnv = loadMpesaConfig(),
): Promise<MpesaResult> {
  if (!params.queryReference) throw new ValidationError('Missing queryReference');

  if (isMockMode(cfg)) {
    return normalize({
      output_ResponseCode: MPESA_SUCCESS_CODE,
      output_ResponseDesc: 'Completed (mock)',
      output_TransactionID: params.queryReference,
      output_ThirdPartyReference: params.thirdPartyReference,
    });
  }

  try {
    const res = await axios.get<MpesaRawResponse>(mpesaUrl(cfg, 'query'), {
      timeout: cfg.MPESA_REQUEST_TIMEOUT_MS,
      headers: headers(cfg),
      params: {
        input_ServiceProviderCode: cfg.MPESA_SERVICE_PROVIDER_CODE,
        input_QueryReference: params.queryReference,
        input_ThirdPartyReference: params.thirdPartyReference,
      },
    });
    return normalize(res.data);
  } catch (err) {
    return toAppError(err, 'queryTransactionStatus');
  }
}

/** Reverse a previous transaction. Requires initiator + security credential. */
export async function reversal(
  params: ReversalParams,
  cfg: MpesaEnv = loadMpesaConfig(),
): Promise<MpesaResult> {
  const amount = assertAmount(params.amount);
  if (!params.transactionId) throw new ValidationError('Missing transactionId');

  if (isMockMode(cfg)) {
    return normalize({
      output_ResponseCode: MPESA_SUCCESS_CODE,
      output_ResponseDesc: 'Reversed (mock)',
      output_TransactionID: params.transactionId,
      output_ThirdPartyReference: params.thirdPartyReference,
    });
  }

  if (!cfg.MPESA_INITIATOR_IDENTIFIER || !cfg.MPESA_SECURITY_CREDENTIAL) {
    throw new ValidationError(
      'Reversal requires MPESA_INITIATOR_IDENTIFIER and MPESA_SECURITY_CREDENTIAL',
    );
  }

  try {
    const res = await axios.put<MpesaRawResponse>(
      mpesaUrl(cfg, 'reversal'),
      {
        input_ReversalAmount: amount,
        input_TransactionID: params.transactionId,
        input_ThirdPartyReference: params.thirdPartyReference,
        input_ServiceProviderCode: cfg.MPESA_SERVICE_PROVIDER_CODE,
        input_InitiatorIdentifier: cfg.MPESA_INITIATOR_IDENTIFIER,
        input_SecurityCredential: cfg.MPESA_SECURITY_CREDENTIAL,
      },
      { timeout: cfg.MPESA_REQUEST_TIMEOUT_MS, headers: headers(cfg) },
    );
    return normalize(res.data);
  } catch (err) {
    return toAppError(err, 'reversal');
  }
}
