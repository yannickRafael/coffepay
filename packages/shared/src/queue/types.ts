export const QUEUE_NAMES = {
  paymentProcess: 'payment-process',
  merchantNotify: 'merchant-notify',
  paymentProcessDlq: 'payment-process-dlq',
  merchantNotifyDlq: 'merchant-notify-dlq',
} as const;

/** Job to process a payment asynchronously (worker runs the C2B call — T21). */
export interface PaymentJob {
  paymentId: string;
  sessionId: string;
  msisdn: string;
  amountMZN: string;
  reference: string;
  thirdPartyReference: string;
}

/** Job to deliver a signed webhook to a merchant (worker sends it — T25). */
export interface MerchantNotifyJob {
  webhookId: string;
  merchantId: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}

/** Envelope stored in a DLQ when a job exhausts its retries. */
export interface DeadLetter<T = unknown> {
  queue: string;
  jobId?: string;
  data: T;
  failedReason: string;
  attemptsMade: number;
  failedAt: string;
}
