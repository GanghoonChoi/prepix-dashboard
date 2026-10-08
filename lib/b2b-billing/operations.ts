import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { apiClient } from "../api/client";
import type {
  ChargeTeamQuote,
  AcceptRenewalConsent,
  BillingOperationAction,
  BillingOperationReceipt,
  ChangeTeamBillingProfile,
  ChangeTeamRenewalPlan,
  CompletePaymentMethodRegistration,
  CreateTeamOrder,
  CreateTeamRefund,
  CreateTeamTermination,
  DeclineRenewalConsent,
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
  TeamRenewalConsent,
  TeamTerminationPreview,
  TeamTerminationResult,
} from "../api/generated/b2b";
import { releaseRejected, discardUnapplied, freeable } from "../api/session";

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
  // Legal floor (SOT: backend/docs/b2b-legal-floor.md). The consent ID is part
  // of the server's request hash, so it is stored with the body it answers.
  termination: CreateTeamTermination;
  "renewal.consent.accept": AcceptRenewalConsent & { consentId: string };
  "renewal.consent.decline": DeclineRenewalConsent & { consentId: string };
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
  try { if (new URL(scope.origin).origin !== scope.origin) return false; } catch { return false; }
  if (![scope.userId, scope.workspaceId].every((id) => typeof id === "string" && uuid.test(id))) return false;
  if (r?.action === "order" && (!uuid.test((r.input as CreateTeamOrder)?.quoteId) || r.topic !== (r.input as CreateTeamOrder)?.quoteId)) return false;
  if (r?.action === "refund" && (!uuid.test((r.input as CreateTeamRefund)?.orderId) || r.topic !== (r.input as CreateTeamRefund)?.orderId)) return false;
  if (r?.action === "method.remove" && (!uuid.test((r.input as Inputs["method.remove"])?.methodId) || r.topic !== (r.input as Inputs["method.remove"])?.methodId)) return false;
  if ((r?.action === "renewal.consent.accept" || r?.action === "renewal.consent.decline") && (!uuid.test((r.input as { consentId: string })?.consentId) || r.topic !== (r.input as { consentId: string })?.consentId)) return false;
  const fixedTopics = { profile: "profile", renewal: "renewal", "renewal.stop": "stop", "method.start": "method", termination: "termination" };
  if (r?.action in fixedTopics && r.topic !== fixedTopics[r.action as keyof typeof fixedTopics]) return false;
  return (
    !!r &&
    r.schema === 1 &&
    !!r.scope &&
    scopeKey(r.scope) === scopeKey(scope) &&
    ["order", "profile", "renewal", "renewal.stop", "refund", "method.start", "method.remove", "termination", "renewal.consent.accept", "renewal.consent.decline"].includes(r.action) &&
    typeof r.topic === "string" &&
    r.topic.length > 0 &&
    r.topic.length <= 200 &&
    !!r.input &&
    uuid.test((r.input as { requestKey: string }).requestKey) &&
    Number.isSafeInteger(r.attempts) &&
    r.attempts >= 0
  );
}
export const sameBillingIntent = (a: BillingRecord, b: BillingRecord) =>
  recordKey(a) === recordKey(b) && inputHash({ ...a.input, requestKey: undefined }) === inputHash({ ...b.input, requestKey: undefined });
export interface BillingStore {
  list(scope: BillingScope): Promise<BillingRecord[]>;
  get(key: Pick<BillingRecord, "scope" | "action" | "topic">): Promise<BillingRecord | null>;
  prepare(record: BillingRecord, assertCurrent?: () => void): Promise<BillingRecord>;
  start(record: BillingRecord, assertCurrent?: () => void): Promise<BillingRecord>;
  finish(record: BillingRecord, assertCurrent?: () => void): Promise<void>;
  rejectFirst(record: BillingRecord, assertCurrent?: () => void): Promise<void>;
}
const invalid = () => new Error("B2B_BILLING_OPERATION_INVALID");
const pending = () => new Error("B2B_BILLING_OPERATION_PENDING");
function prepare(prior: BillingRecord | undefined, r: BillingRecord) {
  if (prior && !sameBillingIntent(prior, r)) throw pending();
  return prior ?? r;
}
function start(prior: BillingRecord | undefined, r: BillingRecord) {
  if (!prior || prior.input.requestKey !== r.input.requestKey || !sameBillingIntent(prior, r)) throw pending();
  return { ...prior, attempts: prior.attempts + 1 };
}
export class MemoryBillingStore implements BillingStore {
  rows = new Map<string, BillingRecord>();
  async list(scope: BillingScope) {
    const prefix = JSON.stringify([scopeKey(scope)]).slice(0, -1) + ",";
    const rows = [...this.rows.entries()].filter(([key]) => key.startsWith(prefix)).map(([, r]) => r);
    if (rows.some((r) => !validRecord(r, scope))) throw invalid();
    return rows.map((r) => structuredClone(r));
  }
  async get(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    const r = this.rows.get(recordKey(k));
    if (r && !validRecord(r, k.scope)) throw invalid();
    return r ? structuredClone(r) : null;
  }
  private change(r: BillingRecord, apply: (prior?: BillingRecord) => BillingRecord | undefined, assertCurrent?: () => void) {
    assertCurrent?.();
    if (!validRecord(r, r.scope)) throw invalid();
    const prior = this.rows.get(recordKey(r));
    if (prior && !validRecord(prior, r.scope)) throw invalid();
    const next = apply(prior);
    if (next) this.rows.set(recordKey(r), structuredClone(next)); else this.rows.delete(recordKey(r));
    return structuredClone(next);
  }
  async prepare(r: BillingRecord, assertCurrent?: () => void) { return this.change(r, (p) => prepare(p, r), assertCurrent)!; }
  async start(r: BillingRecord, assertCurrent?: () => void) { return this.change(r, (p) => start(p, r), assertCurrent)!; }
  async finish(r: BillingRecord, assertCurrent?: () => void) { this.change(r, (p) => p?.input.requestKey === r.input.requestKey ? undefined : p, assertCurrent); }
  async rejectFirst(r: BillingRecord, assertCurrent?: () => void) { this.change(r, (p) => p?.input.requestKey === r.input.requestKey && p.attempts === 1 && r.attempts === 1 ? undefined : p, assertCurrent); }
}
export class BrowserBillingStore implements BillingStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-billing", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("operations");
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
      r.onerror = r.onblocked = () => reject(new Error("B2B_BILLING_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  private async read<T>(run: (s: IDBObjectStore) => IDBRequest, pick: (result: unknown) => T) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"), request = run(tx.objectStore("operations"));
      tx.oncomplete = () => { try { resolve(pick(request.result)); } catch (e) { reject(e); } };
      tx.onabort = tx.onerror = () => reject(new Error("B2B_BILLING_STORAGE_UNAVAILABLE"));
    });
  }
  async list(scope: BillingScope) {
    const prefix = JSON.stringify([scopeKey(scope)]).slice(0, -1) + ",";
    return this.read((s) => s.getAll(IDBKeyRange.bound(prefix, prefix + "￿")), (raw) => {
      const rows = raw as BillingRecord[];
      if (rows.some((r) => !validRecord(r, scope))) throw invalid();
      return rows;
    });
  }
  async get(k: Pick<BillingRecord, "scope" | "action" | "topic">) {
    return this.read((s) => s.get(recordKey(k)), (r) => { if (r !== undefined && !validRecord(r, k.scope)) throw invalid(); return (r as BillingRecord | undefined) ?? null; });
  }
  private async change(r: BillingRecord, apply: (prior?: BillingRecord) => BillingRecord | undefined, assertCurrent?: () => void) {
    if (!validRecord(r, r.scope)) throw invalid();
    const db = await this.open();
    assertCurrent?.();
    return new Promise<BillingRecord | undefined>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"), store = tx.objectStore("operations"), read = store.get(recordKey(r));
      let next: BillingRecord | undefined, error: unknown;
      read.onsuccess = () => {
        try {
          assertCurrent?.();
          if (read.result !== undefined && !validRecord(read.result, r.scope)) throw invalid();
          next = apply(read.result);
          if (next) store.put(next, recordKey(r)); else store.delete(recordKey(r));
        } catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = tx.onerror = () => reject(error ?? new Error("B2B_BILLING_STORAGE_UNAVAILABLE"));
    });
  }
  async prepare(r: BillingRecord, assertCurrent?: () => void) { return (await this.change(r, (p) => prepare(p, r), assertCurrent))!; }
  async start(r: BillingRecord, assertCurrent?: () => void) { return (await this.change(r, (p) => start(p, r), assertCurrent))!; }
  async finish(r: BillingRecord, assertCurrent?: () => void) { await this.change(r, (p) => p?.input.requestKey === r.input.requestKey ? undefined : p, assertCurrent); }
  async rejectFirst(r: BillingRecord, assertCurrent?: () => void) { await this.change(r, (p) => p?.input.requestKey === r.input.requestKey && p.attempts === 1 && r.attempts === 1 ? undefined : p, assertCurrent); }
}

export function billingApi(scope: Omit<BillingScope, "userId"> & { userId: string | null }) {
  const e = encodeURIComponent;
  const localActor = () => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id ?? null; }
    catch { throw new Error("B2B_BILLING_ACCOUNT_CHANGED"); }
  };
  const assertScope = (r?: BillingRecord, allowUnpinned = false) => {
    if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin) throw new Error("B2B_BILLING_SERVICE_CHANGED");
    if (r && scopeKey(r.scope) !== scopeKey(scope as BillingScope)) throw new Error("B2B_BILLING_SCOPE_CHANGED");
    if (!scope.userId && !allowUnpinned) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
    if (typeof window !== "undefined") {
      const id = localActor();
      if (!id || (scope.userId && id !== scope.userId)) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
      const base = `/dashboard/workspaces/${scope.workspaceId}`;
      if (window.location.pathname !== base && !window.location.pathname.startsWith(`${base}/`)) throw new Error("B2B_BILLING_SCOPE_CHANGED");
    }
  };
  const headers = () => scope.userId ? { "X-Prepix-Account-ID": scope.userId } : {};
  const base = `/workspaces/${e(scope.workspaceId)}/b2b`;
  const get = async <T>(path: string, learn = false) => {
    assertScope(undefined, learn);
    const initial = localActor();
    const value = (await apiClient.get<{ data: T }>(path, { headers: headers(), timeout: 15_000 })).data.data;
    assertScope(undefined, learn);
    if (learn && typeof window !== "undefined" && localActor() !== initial) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
    const actor = (value as { currentUserId?: string })?.currentUserId;
    if (actor && scope.userId && actor !== scope.userId) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
    if (learn && typeof window !== "undefined" && actor !== initial) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
    return value;
  };
  const send = async <T>(method: "POST" | "PUT", path: string, data: unknown) => {
    assertScope();
    const value = (await apiClient.request<{ data: T }>({ method, url: path, data, headers: headers(), timeout: 70_000 })).data.data;
    assertScope();
    return value;
  };
  return {
    assertScope,
    overview: () => get<TeamBilling>(`${base}/billing`, true),
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
    charge: (input: ChargeTeamQuote) =>
      send<{ order: TeamOrder }>("POST", `${base}/billing/charge`, input),
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
    terminationPreview: () => send<TeamTerminationPreview>("POST", `${base}/billing/termination/preview`, {}),
    terminate: (input: CreateTeamTermination) =>
      send<TeamTerminationResult & { requestId: string }>("POST", `${base}/billing/termination`, input),
    acceptConsent: (consentId: string, input: AcceptRenewalConsent) =>
      send<{ consent: TeamRenewalConsent; requestId: string }>("POST", `${base}/billing/renewal/consents/${e(consentId)}/accept`, input),
    declineConsent: (consentId: string, input: DeclineRenewalConsent) =>
      send<{ consent: TeamRenewalConsent; requestId: string }>("POST", `${base}/billing/renewal/consents/${e(consentId)}/decline`, input),
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
  termination: "termination",
  "renewal.consent.accept": "renewal.consent.accept",
  "renewal.consent.decline": "renewal.consent.decline",
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
    case "termination": return api.terminate(i);
    // The consent ID travels in the path; the strict DTO refuses it in the body.
    case "renewal.consent.accept": {
      const { consentId, ...input } = r.input as Inputs["renewal.consent.accept"];
      return api.acceptConsent(consentId, input);
    }
    case "renewal.consent.decline": {
      const { consentId, ...input } = r.input as Inputs["renewal.consent.decline"];
      return api.declineConsent(consentId, input);
    }
  }
};
export const pendingOutcome = (error: unknown) => !freeable(error);
/** The stored server result of a lost change, or null when none exists yet. */
export async function checkRecord(r: BillingRecord, api: BillingApi, store: BillingStore) {
  api.assertScope?.(r);
  const found = await api.operation(operation[r.action], r.input.requestKey, inputHash(r.input));
  api.assertScope?.(r);
  if (found.currentUserId !== r.scope.userId) throw new Error("B2B_BILLING_ACCOUNT_CHANGED");
  if (found.receipt) await store.finish(r, () => api.assertScope?.(r));
  api.assertScope?.(r);
  return found.receipt;
}
/** Drop a change this account's server never applied. The lookup runs first, so
 * an applied change is cleared as confirmed. Returns true only when discarded. */
export async function discardRecord(r: BillingRecord, api: BillingApi, store: BillingStore) {
  return discardUnapplied(() => checkRecord(r, api, store), () => store.finish(r, () => api.assertScope?.(r)));
}
/** Persist and start atomically, always preserving the first key for this intent. */
export async function runRecord<A extends BillingAction>(fresh: BillingRecord<A>, api: BillingApi, store: BillingStore): Promise<Record<string, unknown>> {
  api.assertScope?.(fresh);
  const record = await store.prepare(fresh, () => api.assertScope?.(fresh));
  api.assertScope?.(record);
  if (record.attempts > 0) {
    const found = await checkRecord(record, api, store);
    if (found) return found;
  }
  const started = await store.start(record, () => api.assertScope?.(record));
  api.assertScope?.(started);
  try {
    const result = await sendFor(api, started);
    api.assertScope?.(started);
    await store.finish(started, () => api.assertScope?.(started));
    api.assertScope?.(started);
    return result;
  } catch (error) {
    api.assertScope?.(started);
    const guard = () => api.assertScope?.(started);
    await releaseRejected(error, started.attempts, () => store.rejectFirst(started, guard), () => checkRecord(started, api, store), () => store.finish(started, guard));
    throw error;
  }
}
