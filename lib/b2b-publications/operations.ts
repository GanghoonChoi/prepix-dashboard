import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { PublicationMutationLookup, PublicationMutationResult } from "../api/generated/b2b";
import { releaseRejected } from "../api/session";

export type PublicationScope = { origin: string; userId: string; workspaceId: string; projectId: string };
export type PublicationOperation = {
  schema: 1; scope: PublicationScope; action: "register" | "publish"; target?: string;
  versionId?: string; input: { requestKey: string } & Record<string, unknown>; attempts: number;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const publicationScopeKey = (s: PublicationScope) => JSON.stringify([s.origin, s.userId, s.workspaceId, s.projectId]);
const slot = (r: PublicationOperation) => JSON.stringify([publicationScopeKey(r.scope), r.action, r.target ?? null]);
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canonical(x)]));
  return v;
}
// The endpoint binds project and target; the server hashes the original body.
export const publicationHash = (r: PublicationOperation) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(canonical(r.input)))));
export const samePublicationIntent = (a: PublicationOperation, b: PublicationOperation) => slot(a) === slot(b) && a.versionId === b.versionId && JSON.stringify(canonical({ ...a.input, requestKey: undefined })) === JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validPublicationOperation(raw: unknown, scope: PublicationScope): raw is PublicationOperation {
  const r = raw as PublicationOperation;
  if (!r || r.schema !== 1 || !r.scope || publicationScopeKey(r.scope) !== publicationScopeKey(scope) || ![r.scope.userId, r.scope.workspaceId, r.scope.projectId].every((v) => uuid.test(v)) || !r.input || !uuid.test(r.input.requestKey) || !Number.isSafeInteger(r.attempts) || r.attempts < 0) return false;
  try { if (new URL(r.scope.origin).origin !== r.scope.origin) return false; } catch { return false; }
  if (r.action === "register") return r.target === undefined && uuid.test(String(r.input.participationId)) && uuid.test(String(r.input.uploadId)) && typeof r.input.originWorkId === "string" && !!r.input.originWorkId && typeof r.input.originResultId === "string" && !!r.input.originResultId && Number.isSafeInteger(r.input.basisRevision) && Number(r.input.basisRevision) >= 0;
  if (r.action !== "publish" || !uuid.test(r.target ?? "") || !uuid.test(r.versionId ?? "") || !Number.isSafeInteger(r.input.revision) || Number(r.input.revision) < 0) return false;
  const audience = r.input.audienceUserIds;
  return Array.isArray(audience) && audience.length > 0 && audience.every((v) => typeof v === "string" && uuid.test(v)) && new Set(audience).size === audience.length && typeof r.input.approverUserId === "string" && audience.includes(r.input.approverUserId);
}
export interface PublicationStore {
  list(s: PublicationScope): Promise<PublicationOperation[]>;
  prepare(r: PublicationOperation): Promise<PublicationOperation>;
  start(r: PublicationOperation): Promise<PublicationOperation>;
  finish(r: PublicationOperation, assertCurrent?: () => void): Promise<void>;
  rejectFirst(r: PublicationOperation, assertCurrent?: () => void): Promise<void>;
}
export class BrowserPublicationStore implements PublicationStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-publications", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("operations");
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
      r.onerror = r.onblocked = () => reject(new Error("B2B_PUBLICATION_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  async list(scope: PublicationScope) {
    const db = await this.open();
    return new Promise<PublicationOperation[]>((resolve, reject) => {
      const t = db.transaction("operations", "readonly"), read = t.objectStore("operations").getAll();
      t.oncomplete = () => {
        const rows = (read.result as PublicationOperation[]).filter((r) => r?.scope && publicationScopeKey(r.scope) === publicationScopeKey(scope));
        if (rows.some((r) => !validPublicationOperation(r, scope))) reject(new Error("B2B_PUBLICATION_OPERATION_INVALID")); else resolve(rows);
      };
      t.onerror = t.onabort = () => reject(new Error("B2B_PUBLICATION_STORAGE_UNAVAILABLE"));
    });
  }
  private async change(r: PublicationOperation, apply: (prior?: PublicationOperation) => PublicationOperation | undefined) {
    if (!validPublicationOperation(r, r.scope)) throw new Error("B2B_PUBLICATION_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<PublicationOperation>((resolve, reject) => {
      const t = db.transaction("operations", "readwrite"), s = t.objectStore("operations"), read = s.get(slot(r));
      let next: PublicationOperation | undefined, failure: unknown;
      read.onsuccess = () => {
        try {
          if (read.result && !validPublicationOperation(read.result, r.scope)) throw new Error("B2B_PUBLICATION_OPERATION_INVALID");
          next = apply(read.result); if (next) s.put(next, slot(r)); else s.delete(slot(r));
        } catch (e) { failure = e; t.abort(); }
      };
      t.oncomplete = () => resolve(next as PublicationOperation);
      t.onerror = t.onabort = () => reject(failure ?? new Error("B2B_PUBLICATION_STORAGE_UNAVAILABLE"));
    });
  }
  prepare(r: PublicationOperation) { return this.change(r, (p) => { if (p && !samePublicationIntent(p, r)) throw new Error("B2B_PUBLICATION_OPERATION_PENDING"); return p ?? r; }); }
  start(r: PublicationOperation) { return this.change(r, (p) => { if (!p || p.input.requestKey !== r.input.requestKey) throw new Error("B2B_PUBLICATION_OPERATION_PENDING"); return { ...p, attempts: p.attempts + 1 }; }); }
  async finish(r: PublicationOperation, assertCurrent?: () => void) { await this.change(r, (p) => { assertCurrent?.(); return p && p.input.requestKey !== r.input.requestKey ? p : undefined; }); }
  async rejectFirst(r: PublicationOperation, assertCurrent?: () => void) { await this.change(r, (p) => { assertCurrent?.(); return p?.input.requestKey === r.input.requestKey && p.attempts === 1 && r.attempts === 1 ? undefined : p; }); }
}
export interface PublicationApi { assertScope?(r: PublicationOperation): void; lookup(r: PublicationOperation): Promise<PublicationMutationLookup>; apply(r: PublicationOperation): Promise<unknown> }
export async function checkPublication(r: PublicationOperation, api: PublicationApi, store: PublicationStore) {
  api.assertScope?.(r);
  const found = await api.lookup(r);
  api.assertScope?.(r);
  if (found.currentUserId !== r.scope.userId) throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  if (found.state === "not_received" && found.result === null) return null;
  const result = found.result;
  if (found.state !== "completed" || !result || !uuid.test(result.requestId) || !uuid.test(result.publicationId) || !uuid.test(result.versionId) || !Number.isSafeInteger(result.projectRevision) || result.projectRevision < 0 || (r.target && result.publicationId !== r.target) || (r.versionId && result.versionId !== r.versionId) || (r.action === "publish" ? result.state !== "published" || !uuid.test(result.reviewId ?? "") : result.state !== "registered" || result.reviewId !== null)) throw new Error("B2B_PUBLICATION_RECEIPT_INVALID");
  await store.finish(r, () => api.assertScope?.(r));
  api.assertScope?.(r); return result;
}
/** Durable original input first. Only an authorized, hash-bound not_received
 * response permits sending the same original key. Unknown reads never write. */
export async function runPublication(r: PublicationOperation, api: PublicationApi, store: PublicationStore): Promise<PublicationMutationResult> {
  api.assertScope?.(r);
  const original = await store.prepare(r), receipt = await checkPublication(original, api, store);
  if (receipt) return receipt;
  const started = await store.start(original);
  api.assertScope?.(started);
  try { await api.apply(started); }
  catch (e) {
    const recovered = await checkPublication(started, api, store);
    if (recovered) return recovered;
    const guard = () => api.assertScope?.(started);
    // The lookup above already found no receipt.
    await releaseRejected(e, started.attempts, () => store.rejectFirst(started, guard), () => Promise.resolve(null), () => store.finish(started, guard));
    throw e;
  }
  const confirmed = await checkPublication(started, api, store);
  if (!confirmed) throw new Error("B2B_PUBLICATION_OPERATION_PENDING");
  return confirmed;
}
