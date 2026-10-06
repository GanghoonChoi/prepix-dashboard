import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  ReviewMutationAction,
  ReviewMutationLookup,
  ReviewMutationResult,
} from "../api/generated/b2b";

// SOT: prepix-backend backend/docs/b2b-reviews.md "응답 유실".
// A change is first recorded with its original input and request key, scoped
// to service, account and the access path (project or share). Only this
// account's server receipt clears it; an empty lookup never starts a new
// change. Share tokens are never stored here.
export type ReviewScope = {
  origin: string;
  userId: string;
  reviewId: string;
} & (
  | { kind: "project"; workspaceId: string; projectId: string }
  | { kind: "share"; shareId: string }
);
export type ReviewRecord = {
  schema: 1;
  scope: ReviewScope;
  action: ReviewMutationAction;
  target?: string;
  input: { requestKey: string } & Record<string, unknown>;
  attempts: number;
};
export type ReviewDraft = {
  body: string;
  startMs: number;
  endMs: number | null;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SHARE_ACTIONS = ["comment", "edit", "decide", "cancel"];
const ACTIONS = [
  "create",
  "round",
  "approver",
  "decide",
  "cancel",
  "comment",
  "edit",
  "convert",
  "share",
  "revoke",
];
export const scopeKey = (s: ReviewScope) =>
  JSON.stringify(
    s.kind === "project"
      ? [s.origin, s.userId, "project", s.workspaceId, s.projectId, s.reviewId]
      : [s.origin, s.userId, "share", s.shareId, s.reviewId],
  );
const recordKey = (r: Pick<ReviewRecord, "scope" | "action" | "target">) =>
  JSON.stringify([scopeKey(r.scope), r.action, r.target ?? null]);
export const draftKey = (s: ReviewScope, round: number) =>
  JSON.stringify([scopeKey(s), round]);
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => [k, canonical(x)]),
    );
  return v;
}
/** Same canonical SHA-256 the server stores for the request key. */
export const reviewHash = (r: ReviewRecord) =>
  bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(canonical(r.input)))),
  );
export const sameIntent = (a: ReviewRecord, b: ReviewRecord) =>
  a.action === b.action &&
  a.target === b.target &&
  JSON.stringify(canonical({ ...a.input, requestKey: undefined })) ===
    JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validScope(s: unknown): s is ReviewScope {
  const v = s as ReviewScope;
  if (!v || !uuid.test(v.userId ?? "") || !uuid.test(v.reviewId ?? ""))
    return false;
  try {
    if (new URL(v.origin).origin !== v.origin) return false;
  } catch {
    return false;
  }
  return v.kind === "project"
    ? uuid.test(v.workspaceId ?? "") && uuid.test(v.projectId ?? "")
    : v.kind === "share" && uuid.test(v.shareId ?? "");
}
export function validRecord(raw: unknown, scope: ReviewScope): raw is ReviewRecord {
  const r = raw as ReviewRecord;
  if (
    !r ||
    r.schema !== 1 ||
    !validScope(r.scope) ||
    scopeKey(r.scope) !== scopeKey(scope) ||
    !ACTIONS.includes(r.action) ||
    (r.scope.kind === "share" && !SHARE_ACTIONS.includes(r.action)) ||
    !r.input ||
    !uuid.test(r.input.requestKey) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0
  )
    return false;
  // The action's target: none for create, a UUID otherwise.
  if (r.action === "create" ? r.target !== undefined : !uuid.test(r.target ?? ""))
    return false;
  if (
    r.action === "comment" &&
    (typeof r.input.body !== "string" ||
      !r.input.body.trim() ||
      r.input.body.length > 2000 ||
      !Number.isSafeInteger(r.input.startMs) ||
      (r.input.endMs !== null &&
        (!Number.isSafeInteger(r.input.endMs) ||
          (r.input.endMs as number) <= (r.input.startMs as number))))
  )
    return false;
  if (
    r.action === "decide" &&
    !["approved", "changes_requested"].includes(r.input.decision as string)
  )
    return false;
  return true;
}
/** Each action keeps its own pending slot so a lost comment never blocks a
 * decision; two different intents for the same slot are refused. */
export interface ReviewStore {
  list(scope: ReviewScope): Promise<ReviewRecord[]>;
  prepare(r: ReviewRecord): Promise<ReviewRecord>;
  start(r: ReviewRecord): Promise<ReviewRecord>;
  finish(r: ReviewRecord): Promise<void>;
  rejectFirst(r: ReviewRecord): Promise<void>;
  draft(scope: ReviewScope, round: number): Promise<ReviewDraft | null>;
  saveDraft(scope: ReviewScope, round: number, d: ReviewDraft | null): Promise<void>;
}
export class BrowserReviewStore implements ReviewStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-reviews", 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("operations");
        r.result.createObjectStore("drafts");
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = r.onblocked = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  private async tx<T>(
    store: "operations" | "drafts",
    mode: IDBTransactionMode,
    run: (s: IDBObjectStore) => () => T,
  ) {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      let read: () => T = () => undefined as T;
      let failure: unknown;
      try {
        read = run(t.objectStore(store));
      } catch (e) {
        failure = e;
        t.abort();
      }
      t.oncomplete = () => {
        try {
          resolve(read());
        } catch (e) {
          reject(e);
        }
      };
      t.onabort = t.onerror = () =>
        reject(failure ?? new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  async list(scope: ReviewScope) {
    const prefix = scopeKey(scope);
    return this.tx("operations", "readonly", (s) => {
      const all = s.getAll();
      return () => {
        const rows = (all.result as ReviewRecord[]).filter(
          (r) => validScope(r?.scope) && scopeKey(r.scope) === prefix,
        );
        if (rows.some((r) => !validRecord(r, scope)))
          throw new Error("B2B_FILE_OPERATION_INVALID");
        return rows;
      };
    });
  }
  private change(
    r: ReviewRecord,
    apply: (prior?: ReviewRecord) => ReviewRecord | undefined,
  ) {
    if (!validRecord(r, r.scope))
      return Promise.reject(new Error("B2B_FILE_OPERATION_INVALID"));
    return this.tx("operations", "readwrite", (s) => {
      const key = recordKey(r);
      const read = s.get(key);
      let next: ReviewRecord | undefined;
      read.onsuccess = () => {
        try {
          next = apply(read.result);
          if (next) s.put(next, key);
          else s.delete(key);
        } catch (e) {
          read.transaction?.abort();
          throw e;
        }
      };
      return () => next as ReviewRecord;
    });
  }
  prepare(r: ReviewRecord) {
    let error: Error | null = null;
    return this.change(r, (prior) => {
      if (prior && !sameIntent(prior, r)) {
        error = new Error("B2B_FILE_OPERATION_PENDING");
        return prior;
      }
      return prior ?? r;
    }).then((next) => {
      if (error) throw error;
      return next;
    });
  }
  start(r: ReviewRecord) {
    let error: Error | null = null;
    return this.change(r, (prior) => {
      if (!prior || prior.input.requestKey !== r.input.requestKey) {
        error = new Error("B2B_FILE_OPERATION_PENDING");
        return prior;
      }
      return { ...prior, attempts: prior.attempts + 1 };
    }).then((next) => {
      if (error) throw error;
      return next;
    });
  }
  async finish(r: ReviewRecord) {
    await this.change(r, (prior) =>
      prior && prior.input.requestKey !== r.input.requestKey ? prior : undefined,
    );
  }
  async rejectFirst(r: ReviewRecord) {
    await this.change(r, (prior) =>
      prior?.input.requestKey === r.input.requestKey &&
      prior.attempts === 1 &&
      r.attempts === 1
        ? undefined
        : prior,
    );
  }
  draft(scope: ReviewScope, round: number) {
    return this.tx("drafts", "readonly", (s) => {
      const read = s.get(draftKey(scope, round));
      return () => {
        const d = read.result as ReviewDraft | undefined;
        return d && typeof d.body === "string" && Number.isSafeInteger(d.startMs)
          ? d
          : null;
      };
    });
  }
  async saveDraft(scope: ReviewScope, round: number, d: ReviewDraft | null) {
    await this.tx("drafts", "readwrite", (s) => {
      if (d) s.put(d, draftKey(scope, round));
      else s.delete(draftKey(scope, round));
      return () => undefined;
    });
  }
}
/** Sign-out: forget this account's unsent comment text and unconfirmed
 * changes on this device (all accounts when the id is unknown), and every
 * share token held by this tab. Failures are ignored; sign-out must finish. */
export async function purgeReviewLocalData(userId: string | null) {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("prepix-review-share:")) sessionStorage.removeItem(k);
    }
  } catch {
    /* storage blocked */
  }
  const owner = (key: IDBValidKey) => {
    try {
      return JSON.parse(JSON.parse(String(key))[0])[1];
    } catch {
      return null;
    }
  };
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-reviews", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = r.onblocked = r.onupgradeneeded = () => reject(r.error);
    });
    await new Promise<void>((resolve) => {
      const t = db.transaction(["operations", "drafts"], "readwrite");
      for (const name of ["operations", "drafts"]) {
        const s = t.objectStore(name);
        s.openKeyCursor().onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursor | null>).result;
          if (!cursor) return;
          if (!userId || owner(cursor.key) === userId) s.delete(cursor.primaryKey);
          cursor.continue();
        };
      }
      t.oncomplete = t.onerror = t.onabort = () => resolve();
    });
    db.close();
  } catch {
    /* nothing stored */
  }
}
export interface ReviewApi {
  operation(r: ReviewRecord, signal: AbortSignal): Promise<ReviewMutationLookup>;
  apply(r: ReviewRecord, signal: AbortSignal): Promise<unknown>;
}
function receiptValid(r: ReviewRecord, v: ReviewMutationResult) {
  if (
    !v ||
    !uuid.test(v.requestId) ||
    !v.review ||
    (r.action !== "create" && v.review.id !== r.scope.reviewId) ||
    !Number.isInteger(v.review.revision) ||
    (["comment", "edit"].includes(r.action) && !uuid.test(v.commentId ?? "")) ||
    (["decide", "cancel"].includes(r.action) && !uuid.test(v.decisionId ?? "")) ||
    (r.action === "convert" && !uuid.test(v.projectRequestId ?? "")) ||
    (["share", "revoke"].includes(r.action) && !uuid.test(v.shareId ?? ""))
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
}
export async function checkReview(
  r: ReviewRecord,
  api: ReviewApi,
  store: ReviewStore,
  signal: AbortSignal,
) {
  const result = await api.operation(r, signal);
  signal.throwIfAborted();
  if (result.currentUserId !== r.scope.userId)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  if (result.receipt) {
    receiptValid(r, result.receipt);
    await store.finish(r);
  }
  return result.receipt;
}
/** Record first, look up, send once, then require this account's receipt. */
export async function runReview(
  r: ReviewRecord,
  api: ReviewApi,
  store: ReviewStore,
  signal: AbortSignal,
) {
  const prepared = await store.prepare(r);
  signal.throwIfAborted();
  const found = await checkReview(prepared, api, store, signal);
  if (found) return found;
  const started = await store.start(prepared);
  signal.throwIfAborted();
  try {
    await api.apply(started, signal);
    signal.throwIfAborted();
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
      await store.rejectFirst(started);
    throw e;
  }
  const receipt = await checkReview(started, api, store, signal);
  if (!receipt) throw new Error("B2B_FILE_OPERATION_PENDING");
  return receipt;
}

/** Drop a change this account's server never applied: the lookup runs first,
 * so an applied change is cleared as confirmed instead of discarded. Returns
 * true only when it was discarded. */
export async function discardReview(
  r: ReviewRecord,
  api: ReviewApi,
  store: ReviewStore,
  signal: AbortSignal,
) {
  const receipt = await checkReview(r, api, store, signal);
  if (receipt) return false;
  await store.finish(r);
  return true;
}
