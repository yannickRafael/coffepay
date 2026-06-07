/** Webhook event as received from CoffePay (T25 payload). */
export interface ReceivedEvent {
  event: string;
  sessionId?: string;
  paymentId?: string;
  status?: string;
  amountMZN?: string;
  receivedAt: string;
}

// In-memory store of received webhooks, keyed by sessionId. A real merchant
// would persist these; for the demo, last-write-wins per session is enough.
const bySession = new Map<string, ReceivedEvent>();

export function recordEvent(e: ReceivedEvent): void {
  if (e.sessionId) bySession.set(e.sessionId, e);
}

export function getEvent(sessionId: string): ReceivedEvent | undefined {
  return bySession.get(sessionId);
}

/** Test helper: drop all stored events. */
export function clearEvents(): void {
  bySession.clear();
}
