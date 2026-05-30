/** Vodacom OpenAPI raw success code. */
export const MPESA_SUCCESS_CODE = 'INS-0';

export interface C2BParams {
  amount: number | string;
  msisdn: string;
  reference: string; // input_TransactionReference (unique per attempt)
  thirdPartyReference: string;
}

export interface QueryParams {
  queryReference: string; // TransactionID or ConversationID
  thirdPartyReference: string;
}

export interface ReversalParams {
  amount: number | string;
  transactionId: string;
  thirdPartyReference: string;
}

/** Normalized result returned by the client for every operation. */
export interface MpesaResult {
  success: boolean;
  code?: string; // output_ResponseCode, e.g. INS-0
  message?: string; // output_ResponseDesc
  transactionId?: string; // output_TransactionID
  conversationId?: string; // output_ConversationID
  thirdPartyReference?: string;
  raw: unknown;
}

/** Raw Vodacom response envelope (partial). */
export interface MpesaRawResponse {
  output_ResponseCode?: string;
  output_ResponseDesc?: string;
  output_TransactionID?: string;
  output_ConversationID?: string;
  output_ThirdPartyReference?: string;
}
