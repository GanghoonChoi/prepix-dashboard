import { apiClient } from "../client";
import type { DeliveryCheck, DeliveryDetail, DeliveryReceiptLookup } from "../generated/b2b";
import { BrowserDeliveryStore, deliveryScopeKey, runDelivery, type DeliveryAction, type DeliveryApi, type DeliveryOperation, type DeliveryReceipt, type DeliveryScope } from "../../b2b-delivery/operations";
export const deliveryEvents = "prepix-b2b-delivery-changed";
export const deliveryStore = new BrowserDeliveryStore();
const e = encodeURIComponent;
const root = (s: DeliveryScope) => `/workspaces/${e(s.workspaceId)}/b2b/projects/${e(s.projectId)}`;
function headers(s: DeliveryScope) {
  if (new URL(apiClient.defaults.baseURL!).origin !== s.origin) throw new Error("B2B_DELIVERY_SCOPE_CHANGED");
  if (typeof window !== "undefined") {
    let id: unknown;
    try { id = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id; } catch { throw new Error("B2B_DELIVERY_SCOPE_CHANGED"); }
    const base = `/dashboard/workspaces/${s.workspaceId}/projects/${s.projectId}`;
    if (id !== s.userId || (window.location.pathname !== base && !window.location.pathname.startsWith(`${base}/`))) throw new Error("B2B_DELIVERY_SCOPE_CHANGED");
  }
  return { "X-Prepix-Account-ID": s.userId };
}
function verify<T extends { currentUserId: string; workspaceId: string; projectId: string }>(s: DeliveryScope, data: T) {
  headers(s);
  if (!data || data.currentUserId !== s.userId || data.workspaceId !== s.workspaceId || data.projectId !== s.projectId) throw new Error("B2B_DELIVERY_SCOPE_CHANGED");
  return data;
}
async function get<T extends { currentUserId: string; workspaceId: string; projectId: string }>(s: DeliveryScope, path: string) {
  return verify(s, (await apiClient.get<{ data: T }>(path, { headers: headers(s), timeout: 15000 })).data.data);
}
function path(r: DeliveryOperation) {
  const base = root(r.scope);
  if (r.action === "propose") return `${base}/delivery/packages`;
  if (r.action === "confirm" || r.action === "withdraw") return `${base}/delivery/packages/${e(r.packageId!)}/${r.action}`;
  return `${base}/${r.action === "complete" ? "completion" : r.action}`;
}
export function deliveryApi(scope: DeliveryScope): DeliveryApi {
  const assertScope = (r: DeliveryOperation) => { if (deliveryScopeKey(r.scope) !== deliveryScopeKey(scope)) throw new Error("B2B_DELIVERY_SCOPE_CHANGED"); headers(scope); };
  return {
    assertScope,
    lookup: async (r) => {
      assertScope(r);
      const value = await get<DeliveryReceiptLookup>(scope, `${root(scope)}/delivery/receipts/${r.action}/${e(r.input.requestKey)}`);
      return value as DeliveryReceipt;
    },
    apply: async (r) => { assertScope(r); const response = await apiClient.post(path(r), r.input, { headers: headers(scope), timeout: 30000 }); assertScope(r); return response; },
  };
}
export const deliveryService = {
  detail: (s: DeliveryScope) => get<DeliveryDetail>(s, `${root(s)}/delivery`),
  check: (s: DeliveryScope, videoVersionId: string, packageId?: string) => get<DeliveryCheck>(s, `${root(s)}/delivery/check?${new URLSearchParams({ videoVersionId, ...(packageId ? { packageId } : {}) })}`),
  mutate: async (scope: DeliveryScope, action: DeliveryAction, input: DeliveryOperation["input"], packageId?: string) => {
    const operation: DeliveryOperation = { schema: 1, scope, action, input, attempts: 0, ...(packageId ? { packageId } : {}) };
    try { return await runDelivery(operation, deliveryApi(scope), deliveryStore); }
    finally { window.dispatchEvent(new CustomEvent(deliveryEvents, { detail: scope })); }
  },
};
