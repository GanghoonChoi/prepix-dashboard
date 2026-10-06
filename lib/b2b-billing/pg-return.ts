import type { BillingScope } from "./operations";

// The payment window leaves this page and comes back. Before leaving, the
// order, the provider order id, the amount and the scope (service, account,
// team) are written down; the return confirms only against that record.
export type PgIntent = {
  scope: BillingScope;
  orderId: string;
  providerOrderId: string;
  amount: number;
};
const key = (providerOrderId: string) => `prepix-b2b-pg:${providerOrderId}`;
const same = (a: BillingScope, b: BillingScope) =>
  a.origin === b.origin && a.userId === b.userId && a.workspaceId === b.workspaceId;
export function savePgIntent(intent: PgIntent) {
  try {
    window.localStorage.setItem(key(intent.providerOrderId), JSON.stringify(intent));
  } catch {
    // Without the record the return cannot be verified; it then confirms nothing.
  }
}
export function readPgIntent(providerOrderId: string): PgIntent | null {
  try {
    const raw = window.localStorage.getItem(key(providerOrderId));
    return raw ? (JSON.parse(raw) as PgIntent) : null;
  } catch {
    return null;
  }
}
export function clearPgIntent(providerOrderId: string) {
  try {
    window.localStorage.removeItem(key(providerOrderId));
  } catch {
    // nothing to clear
  }
}
/** "ok" only when the return names the order and amount this page shows AND the
 * flow was started by this same service, account and team. */
export function checkPgReturn(
  intent: PgIntent | null,
  scope: BillingScope,
  order: { id: string; providerOrderId: string; amount: number },
  returned: { orderId: string | null; amount: number },
): "ok" | "mismatch" | "scope_mismatch" {
  if (returned.orderId !== order.providerOrderId || returned.amount !== order.amount)
    return "mismatch";
  if (
    !intent ||
    !same(intent.scope, scope) ||
    intent.orderId !== order.id ||
    intent.providerOrderId !== order.providerOrderId ||
    intent.amount !== order.amount
  )
    return "scope_mismatch";
  return "ok";
}
