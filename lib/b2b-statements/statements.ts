import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

// Every view and stored request is pinned to service origin, account and team
// so a switch or a late response can never show another team's statement.
export type StatementScope = {
  origin: string;
  userId: string;
  workspaceId: string;
};
export const scopeKey = (s: StatementScope) =>
  JSON.stringify([s.origin, s.userId, s.workspaceId]);

/** A view owns one cancellable lifetime; no request survives its cleanup. */
export class StatementLifetime {
  private controller = new AbortController();
  private active = false;
  constructor(private readonly allowed: boolean, private readonly key = "statement") {}
  start() { this.controller = new AbortController(); this.active = true; }
  stop() { this.active = false; this.controller.abort(); }
  assertCurrent() {
    if (!this.active || !this.key) throw new Error("B2B_STATEMENT_SCOPE_CHANGED");
    this.controller.signal.throwIfAborted();
    if (!this.allowed) throw new Error("B2B_BILLING_PERMISSION_REQUIRED");
  }
  signal() { this.assertCurrent(); return this.controller.signal; }
}
export type PendingIssue = {
  schema: 2;
  scope: StatementScope;
  month: string;
  requestKey: string;
  attempts: number;
};
export type StatementReceipt = import("../api/generated/b2b").TeamStatementIssueResult & { requestId: string };
export type StatementIssueLookup = import("../api/generated/b2b").TeamStatementIssueLookup;
export interface StatementIssueApi {
  assertScope(record?: PendingIssue): void;
  operation(month: string, requestKey: string, hash: string): Promise<StatementIssueLookup>;
  issue(month: string, requestKey: string): Promise<StatementReceipt>;
}
type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
export const legacyIssueKey = (scope: StatementScope, month: string) =>
  `prepix:b2b-statement-issue:${scopeKey(scope)}:${month}`;
export const issueSlot = (scope: StatementScope, month: string) => JSON.stringify([scopeKey(scope), month]);
const invalid = () => new Error("B2B_STATEMENT_RECOVERY_BLOCKED");
const storageError = () => new Error("B2B_STATEMENT_STORAGE_UNAVAILABLE");
function validScope(s: StatementScope) {
  try { return new URL(s.origin).origin === s.origin && [s.userId, s.workspaceId].every(id => typeof id === "string" && uuid.test(id)); }
  catch { return false; }
}
export function validIssue(raw: unknown, scope: StatementScope, month: string): raw is PendingIssue {
  const r = raw as PendingIssue;
  return !!r && validScope(scope) && MONTH.test(month) && r.schema === 2 && !!r.scope &&
    scopeKey(r.scope) === scopeKey(scope) && r.month === month && typeof r.requestKey === "string" &&
    uuid.test(r.requestKey) && Number.isSafeInteger(r.attempts) && r.attempts >= 0;
}
export const freshIssue = (scope: StatementScope, month: string): PendingIssue => ({ schema: 2, scope, month, requestKey: crypto.randomUUID(), attempts: 0 });
/** Exact canonical input of core.mutate(..., {requestKey, month}). */
export const issueHash = (r: Pick<PendingIssue, "month" | "requestKey">) =>
  bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({ month: r.month, requestKey: r.requestKey }))));
function legacy(storage: KeyValue | undefined, scope: StatementScope, month: string) {
  const text = storage?.getItem(legacyIssueKey(scope, month));
  if (text == null) return null;
  let r: PendingIssue;
  try { r = JSON.parse(text); } catch { throw invalid(); }
  // v1 had no attempt counter: it may already have succeeded. Always look up
  // that original key before another POST, never treat migration as a new issue.
  const migrated = { ...r, schema: 2 as const, attempts: 1 };
  if ((r as unknown as {schema: number}).schema !== 1 || !validIssue(migrated, scope, month)) throw invalid();
  return { record: migrated, text };
}
function priorIssue(raw: unknown, scope: StatementScope, month: string, old: ReturnType<typeof legacy>) {
  if (raw !== undefined && !validIssue(raw, scope, month)) throw invalid();
  const prior = raw as PendingIssue | undefined;
  if (prior && old && prior.requestKey !== old.record.requestKey) throw invalid();
  return prior ?? old?.record;
}
function clearLegacy(storage: KeyValue | undefined, scope: StatementScope, month: string, old: ReturnType<typeof legacy>) {
  if (!old || !storage) return;
  const current = storage.getItem(legacyIssueKey(scope, month));
  if (current === old.text) storage.removeItem(legacyIssueKey(scope, month));
  else if (current !== null) throw invalid();
}
export interface StatementStore {
  get(scope: StatementScope, month: string, assertCurrent?: () => void): Promise<PendingIssue | null>;
  prepare(r: PendingIssue, assertCurrent?: () => void): Promise<PendingIssue>;
  start(r: PendingIssue, assertCurrent?: () => void): Promise<PendingIssue>;
  finish(r: PendingIssue, assertCurrent?: () => void): Promise<void>;
  rejectFirst(r: PendingIssue, assertCurrent?: () => void): Promise<void>;
}
function start(prior: PendingIssue | undefined, r: PendingIssue) {
  if (!prior || prior.requestKey !== r.requestKey) throw invalid();
  return { ...prior, attempts: prior.attempts + 1 };
}
export class MemoryStatementStore implements StatementStore {
  rows = new Map<string, PendingIssue>();
  constructor(private readonly old?: KeyValue) {}
  private change(scope: StatementScope, month: string, apply: (p?: PendingIssue) => PendingIssue | undefined, guard?: () => void) {
    guard?.();
    if (!validScope(scope) || !MONTH.test(month)) throw invalid();
    const old = legacy(this.old, scope, month);
    const next = apply(priorIssue(this.rows.get(issueSlot(scope, month)), scope, month, old));
    guard?.();
    if (next) this.rows.set(issueSlot(scope, month), structuredClone(next)); else this.rows.delete(issueSlot(scope, month));
    clearLegacy(this.old, scope, month, old);
    return next ? structuredClone(next) : null;
  }
  async get(scope: StatementScope, month: string, guard?: () => void) { return this.change(scope, month, p => p, guard); }
  async prepare(r: PendingIssue, guard?: () => void) { if (!validIssue(r, r.scope, r.month)) throw invalid(); return this.change(r.scope, r.month, p => p ?? r, guard)!; }
  async start(r: PendingIssue, guard?: () => void) { return this.change(r.scope, r.month, p => start(p, r), guard)!; }
  async finish(r: PendingIssue, guard?: () => void) { this.change(r.scope, r.month, p => p?.requestKey === r.requestKey ? undefined : p, guard); }
  async rejectFirst(r: PendingIssue, guard?: () => void) { this.change(r.scope, r.month, p => p?.requestKey === r.requestKey && p.attempts === 1 && r.attempts === 1 ? undefined : p, guard); }
}
/** One read/write transaction per slot change serializes every browser tab. */
export class BrowserStatementStore implements StatementStore {
  private opening?: Promise<IDBDatabase>;
  constructor(private readonly old?: KeyValue) {}
  private open() {
    return this.opening ??= new Promise((resolve, reject) => {
      const request = indexedDB.open("prepix-b2b-statements", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("issues");
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = request.onblocked = () => reject(storageError());
    });
  }
  private async change(scope: StatementScope, month: string, apply: (p?: PendingIssue) => PendingIssue | undefined, guard?: () => void) {
    guard?.();
    if (!validScope(scope) || !MONTH.test(month)) throw invalid();
    const db = await this.open();
    guard?.();
    return new Promise<PendingIssue | null>((resolve, reject) => {
      const tx = db.transaction("issues", "readwrite"), store = tx.objectStore("issues"), read = store.get(issueSlot(scope, month));
      let next: PendingIssue | undefined, old: ReturnType<typeof legacy>, error: unknown;
      read.onsuccess = () => {
        try {
          guard?.();
          old = legacy(this.old ?? localStorage, scope, month);
          next = apply(priorIssue(read.result, scope, month, old));
          guard?.();
          if (next) store.put(next, issueSlot(scope, month)); else store.delete(issueSlot(scope, month));
        } catch (e) { error = e; tx.abort(); }
      };
      tx.oncomplete = () => {
        try { guard?.(); clearLegacy(this.old ?? localStorage, scope, month, old); resolve(next ?? null); }
        catch (e) { reject(e); }
      };
      tx.onabort = tx.onerror = () => reject(error ?? storageError());
    });
  }
  async get(scope: StatementScope, month: string, guard?: () => void) { return this.change(scope, month, p => p, guard); }
  async prepare(r: PendingIssue, guard?: () => void) { if (!validIssue(r, r.scope, r.month)) throw invalid(); return (await this.change(r.scope, r.month, p => p ?? r, guard))!; }
  async start(r: PendingIssue, guard?: () => void) { return (await this.change(r.scope, r.month, p => start(p, r), guard))!; }
  async finish(r: PendingIssue, guard?: () => void) { await this.change(r.scope, r.month, p => p?.requestKey === r.requestKey ? undefined : p, guard); }
  async rejectFirst(r: PendingIssue, guard?: () => void) { await this.change(r.scope, r.month, p => p?.requestKey === r.requestKey && p.attempts === 1 && r.attempts === 1 ? undefined : p, guard); }
}
function assertReceipt(receipt: StatementReceipt, r: PendingIssue) {
  if (!receipt || receipt.month !== r.month || receipt.revision?.month !== r.month ||
    !uuid.test(receipt.revision.id) || !uuid.test(receipt.requestId)) throw new Error("B2B_STATEMENT_RECEIPT_MISMATCH");
}
export async function checkIssue(r: PendingIssue, api: StatementIssueApi, store: StatementStore) {
  api.assertScope(r);
  const found = await api.operation(r.month, r.requestKey, issueHash(r));
  api.assertScope(r);
  if (found.currentUserId !== r.scope.userId || found.workspaceId !== r.scope.workspaceId ||
    found.month !== r.month || found.requestKey !== r.requestKey || found.inputHash !== issueHash(r)) throw new Error("B2B_STATEMENT_RECEIPT_MISMATCH");
  if (found.receipt) {
    assertReceipt(found.receipt, r);
    await store.finish(r, () => api.assertScope(r));
    api.assertScope(r);
  }
  return found.receipt;
}
export async function runIssue(fresh: PendingIssue, api: StatementIssueApi, store: StatementStore): Promise<StatementReceipt> {
  api.assertScope(fresh);
  const record = await store.prepare(fresh, () => api.assertScope(fresh));
  api.assertScope(record);
  if (record.attempts > 0) {
    const found = await checkIssue(record, api, store);
    if (found) return found;
  }
  const started = await store.start(record, () => api.assertScope(record));
  api.assertScope(started);
  try {
    const result = await api.issue(started.month, started.requestKey);
    api.assertScope(started);
    assertReceipt(result, started);
    await store.finish(started, () => api.assertScope(started));
    api.assertScope(started);
    return result;
  } catch (error) {
    api.assertScope(started);
    const status = (error as {response?: {status?: number}})?.response?.status;
    if (status && status >= 400 && status < 500 && status !== 408 && status !== 429)
      await store.rejectFirst(started, () => api.assertScope(started));
    throw error;
  }
}

/** Saved only when the exact bytes match the issued revision. */
export function verifiedPdf(
  bytes: ArrayBuffer,
  expected: { sha256: string; bytes: number },
): boolean {
  const view = new Uint8Array(bytes);
  return (
    view.byteLength === expected.bytes &&
    bytesToHex(sha256(view)) === expected.sha256
  );
}

export function monthLabel(month: string, lang: "ko" | "en" = "ko") {
  const [year, value] = month.split("-");
  return lang === "ko"
    ? `${year}년 ${Number(value)}월`
    : `${new Date(Date.UTC(Number(year), Number(value) - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`;
}
export const won = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}원`;
export const units = (value: string | number) =>
  new Intl.NumberFormat("ko-KR").format(BigInt(value));
export const kst = (iso: string | null) => {
  if (!iso) return "-";
  const civil = new Date(Date.parse(iso) + 9 * 3_600_000).toISOString();
  return `${civil.slice(0, 10)} ${civil.slice(11, 16)}`;
};
