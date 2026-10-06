import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { DeliveryMutationResult } from "../api/generated/b2b";

export type DeliveryScope = { origin: string; userId: string; workspaceId: string; projectId: string };
export type DeliveryAction = "propose" | "confirm" | "withdraw" | "complete" | "reopen" | "archive" | "unarchive";
export type DeliveryOperation = { schema: 1; scope: DeliveryScope; action: DeliveryAction; packageId?: string; input: { requestKey: string; revision: number } & Record<string, unknown>; attempts: number };
export type DeliveryReceipt = { currentUserId: string; workspaceId: string; projectId: string; action: DeliveryAction; requestKey: string; inputHash: string; receipt: DeliveryMutationResult };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const actions = ["propose", "confirm", "withdraw", "complete", "reopen", "archive", "unarchive"];
export const deliveryScopeKey = (s: DeliveryScope) => JSON.stringify([s.origin, s.userId, s.workspaceId, s.projectId]);
const slot = (r: DeliveryOperation) => JSON.stringify([deliveryScopeKey(r.scope), r.action, r.packageId ?? null]);
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
  return v;
}
export const deliveryInputHash = (r: DeliveryOperation) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical({ ...r.input, projectId: r.scope.projectId, ...(r.packageId ? { packageId: r.packageId } : {}) })))));
export const sameDeliveryIntent = (a: DeliveryOperation, b: DeliveryOperation) => slot(a) === slot(b) && JSON.stringify(canonical({ ...a.input, requestKey: undefined })) === JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validDeliveryOperation(r: unknown, scope: DeliveryScope): r is DeliveryOperation {
  const v = r as DeliveryOperation;
  if (!v || v.schema !== 1 || !v.scope || deliveryScopeKey(v.scope) !== deliveryScopeKey(scope) || !actions.includes(v.action) || !v.input || !uuid.test(v.input.requestKey) || !Number.isSafeInteger(v.input.revision) || v.input.revision < 0 || !Number.isSafeInteger(v.attempts) || v.attempts < 0) return false;
  try { if (new URL(v.scope.origin).origin !== v.scope.origin) return false; } catch { return false; }
  if (![v.scope.userId, v.scope.workspaceId, v.scope.projectId].every((id) => uuid.test(id))) return false;
  return ["confirm", "withdraw"].includes(v.action) ? uuid.test(v.packageId ?? "") : v.packageId === undefined;
}
export interface DeliveryStore {
  list(s: DeliveryScope): Promise<DeliveryOperation[]>;
  prepare(r: DeliveryOperation): Promise<DeliveryOperation>;
  start(r: DeliveryOperation): Promise<DeliveryOperation>;
  finish(r: DeliveryOperation, assertCurrent?: () => void): Promise<void>;
  rejectFirst(r: DeliveryOperation, assertCurrent?: () => void): Promise<void>;
}
export class BrowserDeliveryStore implements DeliveryStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("prepix-b2b-delivery", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("operations");
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = request.onblocked = () => reject(new Error("B2B_DELIVERY_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  async list(scope: DeliveryScope) {
    const db = await this.open();
    return new Promise<DeliveryOperation[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"), read = tx.objectStore("operations").getAll();
      tx.oncomplete = () => {
        const rows = (read.result as DeliveryOperation[]).filter((r) => r?.scope && deliveryScopeKey(r.scope) === deliveryScopeKey(scope));
        if (rows.some((r) => !validDeliveryOperation(r, scope))) reject(new Error("B2B_DELIVERY_OPERATION_INVALID")); else resolve(rows);
      };
      tx.onerror = tx.onabort = () => reject(new Error("B2B_DELIVERY_STORAGE_UNAVAILABLE"));
    });
  }
  private async change(r: DeliveryOperation, apply: (prior?: DeliveryOperation) => DeliveryOperation | undefined) {
    if (!validDeliveryOperation(r, r.scope)) throw new Error("B2B_DELIVERY_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<DeliveryOperation>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"), store = tx.objectStore("operations"), read = store.get(slot(r));
      let next: DeliveryOperation | undefined, error: unknown;
      read.onsuccess = () => {
        try {
          if (read.result && !validDeliveryOperation(read.result, r.scope)) throw new Error("B2B_DELIVERY_OPERATION_INVALID");
          next = apply(read.result);
          if (next) store.put(next, slot(r)); else store.delete(slot(r));
        } catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(next as DeliveryOperation);
      tx.onerror = tx.onabort = () => reject(error ?? new Error("B2B_DELIVERY_STORAGE_UNAVAILABLE"));
    });
  }
  prepare(r: DeliveryOperation) { return this.change(r, (prior) => { if (prior && !sameDeliveryIntent(prior, r)) throw new Error("B2B_DELIVERY_OPERATION_PENDING"); return prior ?? r; }); }
  start(r: DeliveryOperation) { return this.change(r, (prior) => { if (!prior || prior.input.requestKey !== r.input.requestKey) throw new Error("B2B_DELIVERY_OPERATION_PENDING"); return { ...prior, attempts: prior.attempts + 1 }; }); }
  async finish(r: DeliveryOperation, assertCurrent?: () => void) { await this.change(r, (prior) => { assertCurrent?.(); return prior && prior.input.requestKey !== r.input.requestKey ? prior : undefined; }); }
  async rejectFirst(r: DeliveryOperation, assertCurrent?: () => void) { await this.change(r, (prior) => { assertCurrent?.(); return prior?.input.requestKey === r.input.requestKey && prior.attempts === 1 && r.attempts === 1 ? undefined : prior; }); }
}
export interface DeliveryApi { assertScope?(r: DeliveryOperation): void; lookup(r: DeliveryOperation): Promise<DeliveryReceipt>; apply(r: DeliveryOperation): Promise<unknown> }
const missing = (e: unknown) => (e as { response?: { status?: number; data?: { message?: string } } })?.response?.status === 404 && (e as { response?: { data?: { message?: string } } })?.response?.data?.message === "B2B_DELIVERY_RECEIPT_NOT_FOUND";
export async function checkDelivery(r: DeliveryOperation, api: DeliveryApi, store: DeliveryStore) {
  api.assertScope?.(r);
  let found: DeliveryReceipt;
  try { found = await api.lookup(r); } catch (e) { if (missing(e)) { api.assertScope?.(r); return null; } throw e; }
  api.assertScope?.(r);
  if (found.currentUserId !== r.scope.userId || found.workspaceId !== r.scope.workspaceId || found.projectId !== r.scope.projectId) throw new Error("B2B_DELIVERY_SCOPE_CHANGED");
  if (found.action !== r.action || found.requestKey !== r.input.requestKey || found.inputHash !== deliveryInputHash(r) || !found.receipt || found.receipt.projectId !== r.scope.projectId || found.receipt.currentUserId !== r.scope.userId || found.receipt.workspaceId !== r.scope.workspaceId || !uuid.test(found.receipt.requestId) || !Number.isSafeInteger(found.receipt.revision)) throw new Error("B2B_DELIVERY_RECEIPT_INVALID");
  if ((["propose", "confirm", "withdraw"].includes(r.action) && !uuid.test(found.receipt.packageId ?? "")) || (r.packageId && found.receipt.packageId !== r.packageId) || (r.action === "confirm" && !uuid.test(found.receipt.receiptId ?? "")) || (r.action === "complete" && !uuid.test(found.receipt.snapshotId ?? "")) || (r.action === "reopen" && !uuid.test(found.receipt.reopenId ?? ""))) throw new Error("B2B_DELIVERY_RECEIPT_INVALID");
  await store.finish(r, () => api.assertScope?.(r));
  api.assertScope?.(r);
  return found.receipt;
}
export async function runDelivery(r: DeliveryOperation, api: DeliveryApi, store: DeliveryStore) {
  api.assertScope?.(r);
  const prior = await store.prepare(r), receipt = await checkDelivery(prior, api, store);
  if (receipt) return receipt;
  const started = await store.start(prior);
  api.assertScope?.(started);
  try { await api.apply(started); }
  catch (e) {
    const recovered = await checkDelivery(started, api, store);
    if (recovered) return recovered;
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) await store.rejectFirst(started, () => api.assertScope?.(started));
    throw e;
  }
  const confirmed = await checkDelivery(started, api, store);
  if (!confirmed) throw new Error("B2B_DELIVERY_OPERATION_PENDING");
  return confirmed;
}
