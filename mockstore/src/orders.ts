/** Order context the store remembers per CoffePay session, so the confirmation
 * page can show the product and the original USD amount (the webhook only
 * carries the MZN amount). In-memory; a real merchant would persist this. */
export interface Order {
  productName: string;
  amountUSD: string;
  amountMZN?: string;
}

const bySession = new Map<string, Order>();

export function setOrder(sessionId: string, order: Order): void {
  bySession.set(sessionId, order);
}

export function getOrder(sessionId: string): Order | undefined {
  return bySession.get(sessionId);
}

/** Test helper: drop all stored orders. */
export function clearOrders(): void {
  bySession.clear();
}
