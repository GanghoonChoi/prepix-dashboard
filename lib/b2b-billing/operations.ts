import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { apiClient } from "../api/client";
import type {
  BillingOperationAction,
  BillingOperationReceipt,
  ChangeTeamBillingProfile,
  ChangeTeamRenewalPlan,
  CompletePaymentMethodRegistration,
  CreateTeamOrder,
  CreateTeamRefund,
  PaymentMethodRegistration,
  RemovePaymentMethod,
  StartPaymentMethodRegistration,
  TeamBilling,
  TeamCheckout,
  TeamCommerce,
  TeamOrder,
  TeamOrderList,
  TeamPaymentMethod,
  TeamRefund,
  TeamRefundPreview,
  TeamRefundSelection,
} from "../api/generated/b2b";

// Billing changes are written to this browser's store, keyed by service,
// account and team, BEFORE they are sent. A lost reply is resolved by asking
// the server for the original request key; nothing is inferred from silence.
export type BillingScope = { origin: string; userId: string; workspaceId: string };
type Inputs = {
  order: CreateTeamOrder;
  profile: ChangeTeamBillingProfile;
  renewal: ChangeTeamRenewalPlan;
  "renewal.stop": { requestKey: string };
  refund: CreateTeamRefund;
  "method.start": StartPaymentMethodRegistration;
  "method.remove": RemovePaymentMethod & { methodId: string };
};
export type BillingAction = keyof Inputs;
export type BillingRecord<A extends BillingAction = BillingAction> = {
  schema: 1;
  scope: BillingScope;
  action: A;
  // One open record per topic: an order per quote, a refund per order, etc.
  topic: string;
  input: Inputs[A];
  attempts: number;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const scopeKey = (s: BillingScope) =>
  JSON.stringify([s.origin, s.userId, s.workspaceId]);
export const recordKey = (r: Pick<BillingRecord, "scope" | "action" | "topic">) =>
  JSON.stringify([scopeKey(r.scope), r.action, r.topic]);
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Same canonical SHA-256 the server stores for a request key. */
export const inputHash = (input: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(input)))));
export function validRecord(raw: unknown, scope: BillingScope): raw is BillingRecord {
  const r = raw as BillingRecord;
  return (
    !!r &&
    r.schema === 1 &&
    !!r.scope &&
    scopeKey(r.scope) === scopeKey(scope) &&
    ["order", "profile", "renewal", "renewal.stop", "refund", "method.start", "method.remove"].includes(r.action) &&
    typeof r.topic === "string" &&
    r.topic.length > 0 &&
    r.topic.length <= 200 &&
    !!r.input &&
    uuid.test((r.input as { requestKey: string }).requestKey) &&
    Number.isSafeInteger(r.attempts) &&
    r.attempts >= 0
  );
}
export interface BillingStore {
  list(scope: BillingScope): Promise<BillingRecord[]>;
  get(key: Pick<BillingRecord, "scope" | "action" | "topic">): Promise<BillingRecord | null>;
  put(record: BillingRecord): Promise<void>;
  remove(record: Pick<BillingRecord, "scope" | "action" | "topic">): Promise<void>;
}
export class MemoryBillingStore implements BillingStore {
  rows = new Map<string, BillingRecord>();
  async list(scope: BillingScope) {
    return [...this.rows.values()].filter((r) => validRecord(r, scope));
  }
  async get(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    return this.rows.get(recordKey(k)) ?? null;
  }
  async put(r: BillingRecord) {
    this.rows.set(recordKey(r), structuredClone(r));
  }
  async remove(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    this.rows.delete(recordKey(k));
  }
}
export class BrowserBillingStore implements BillingStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-billing", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("operations");
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = r.onblocked = () =>
        reject(new Error("B2B_BILLING_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  private async tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void, pick?: (r: IDBRequest) => T) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction("operations", mode);
      const request = run(t.objectStore("operations"));
      t.oncomplete = () => resolve(pick && request ? pick(request) : (undefined as T));
      t.onabort = t.onerror = () => reject(new Error("B2B_BILLING_STORAGE_UNAVAILABLE"));
    });
  }
  async list(scope: BillingScope) {
    const prefix = JSON.stringify([scopeKey(scope)]).slice(0, -1) + ",";
    const rows = await this.tx<unknown[]>(
      "readonly",
      (s) => s.getAll(IDBKeyRange.bound(prefix, prefix + "￿")),
      (r) => r.result as unknown[],
    );
    return rows.filter((r): r is BillingRecord => validRecord(r, scope));
  }
  async get(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    const row = await this.tx<unknown>("readonly", (s) => s.get(recordKey(k)), (r) => r.result);
    return validRecord(row, k.scope) ? row : null;
  }
  put(r: BillingRecord) {
    return this.tx<void>("readwrite", (s) => void s.put(r, recordKey(r)));
  }
  remove(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    return this.tx<void>("readwrite", (s) => void s.delete(recordKey(k)));
  }
}

export function billingApi(scope: Omit<BillingScope, "userId"> & { userId: string | null }) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_BILLING_SERVICE_CHANGED");
  const e = encodeURIComponent;
  // Pin the account that started a flow; an unpinned first read learns it.
  const headers: Record<string, string> = scope.userId
    ? { "X-Prepix-Account-ID": scope.userId }
    : {};
  const base = `/workspaces/${e(scope.workspaceId)}/b2b`;
  const get = async <T>(path: string) =>
    (await apiClient.get<{ data: T }>(path, { headers, timeout: 15_000 })).data.data;
  const send = async <T>(method: "POST" | "PUT", path: string, data: unknown) =>
    (await apiClient.request<{ data: T }>({ method, url: path, data, headers, timeout: 70_000 })).data.data;
  return {
    overview: () => get<TeamBilling>(`${base}/billing`),
    commerce: () => get<TeamCommerce>(`${base}/commerce`),
    operation: (action: BillingOperationAction, requestKey: string, hash: string) =>
      get<BillingOperationReceipt>(
        `${base}/billing/operations/${e(action)}/${e(requestKey)}?inputHash=${hash}`,
      ),
    changeProfile: (input: ChangeTeamBillingProfile) =>
      send<{ revision: number; requestId: string }>("PUT", `${base}/billing/profile`, input),
    startMethod: (input: StartPaymentMethodRegistration) =>
      send<PaymentMethodRegistration & { methodId: string; requestId: string }>("POST", `${base}/billing/methods/registrations`, input),
    completeMethod: (methodId: string, input: CompletePaymentMethodRegistration) =>
      send<{ method: TeamPaymentMethod }>("POST", `${base}/billing/methods/registrations/${e(methodId)}/complete`, input),
    removeMethod: (methodId: string, input: RemovePaymentMethod) =>
      send<{ methodId: string; requestId: string }>("POST", `${base}/billing/methods/${e(methodId)}/remove`, input),
    changeRenewal: (input: ChangeTeamRenewalPlan) =>
      send<{ revision: number; requestId: string }>("PUT", `${base}/billing/renewal`, input),
    stopRenewal: (input: { requestKey: string }) =>
      send<{ inFlightOrderId: string | null; requestId: string }>("POST", `${base}/billing/renewal/stop`, input),
    orders: (cursor?: string) =>
      get<TeamOrderList>(`${base}/commerce/orders${cursor ? `?cursor=${e(cursor)}` : ""}`),
    order: (orderId: string) => get<{ order: TeamOrder }>(`${base}/commerce/orders/${e(orderId)}`),
    createOrder: (input: CreateTeamOrder) =>
      send<{ orderId: string; providerOrderId: string; expiresAt: string; requestId: string }>("POST", `${base}/commerce/orders`, input),
    checkout: (orderId: string) => get<TeamCheckout>(`${base}/commerce/orders/${e(orderId)}/checkout`),
    confirm: (orderId: string, paymentKey: string) =>
      send<{ order: TeamOrder }>("POST", `${base}/commerce/orders/${e(orderId)}/confirm`, { paymentKey }),
    refundPreview: (orderId: string, selection: TeamRefundSelection) =>
      send<TeamRefundPreview>("POST", `${base}/commerce/refunds/preview`, { orderId, selection }),
    requestRefund: (input: CreateTeamRefund) =>
      send<{ refundId: string; state: string; requestId: string }>("POST", `${base}/commerce/refunds`, input),
    refunds: (orderId: string) =>
      get<{ currentUserId: string; items: TeamRefund[] }>(`${base}/commerce/refunds?orderId=${e(orderId)}`),
  };
}
export type BillingApi = ReturnType<typeof billingApi>;
const operation: Record<BillingAction, BillingOperationAction> = {
  order: "order",
  profile: "profile",
  renewal: "renewal",
  "renewal.stop": "renewal.stop",
  refund: "refund",
  "method.start": "method.start",
  "method.remove": "method.remove",
};
const sendFor = (api: BillingApi, r: BillingRecord): Promise<Record<string, unknown>> => {
  const i = r.input as never;
  switch (r.action) {
    case "order": return api.createOrder(i);
    case "profile": return api.changeProfile(i);
    case "renewal": return api.changeRenewal(i);
    case "renewal.stop": return api.stopRenewal(i);
    case "refund": return api.requestRefund(i);
    case "method.start": return api.startMethod(i);
    case "method.remove": {
      const { methodId, ...input } = r.input as Inputs["method.remove"];
      return api.removeMethod(methodId, input);
    }
  }
};
export const pendingOutcome = (error: unknown) => {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return !(typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429);
};
/** The stored server result of a lost change, or null when none exists yet. */
export async function checkRecord(r: BillingRecord, api: BillingApi, store: BillingStore) {
  const found = await api.operation(operation[r.action], r.input.requestKey, inputHash(r.input));
  if (found.currentUserId !== r.scope.userId) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
  if (found.receipt) await store.remove(r);
  return found.receipt;
}
/** Persist first, check for an earlier success, then send the same input. */
export async function runRecord<A extends BillingAction>(
  fresh: BillingRecord<A>,
  api: BillingApi,
  store: BillingStore,
): Promise<Record<string, unknown>> {
  const prior = (await store.get(fresh)) as BillingRecord<A> | null;
  const record = prior ?? fresh;
  if (prior && prior.attempts > 0) {
    const found = await checkRecord(prior, api, store);
    if (found) return found;
  }
  const started = { ...record, attempts: record.attempts + 1 };
  await store.put(started);
  try {
    const result = await sendFor(api, started);
    await store.remove(started);
    return result;
  } catch (error) {
    // Only a definitive rejection of the very first attempt frees the topic;
    // a later 4xx cannot disprove an earlier lost success.
    if (!pendingOutcome(error) && started.attempts === 1) await store.remove(started);
    throw error;
  }
}
