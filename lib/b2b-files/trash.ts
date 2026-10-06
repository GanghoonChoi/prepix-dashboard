import { apiClient } from "../api/client";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { FileScope } from "./api";
import type {
  TeamFileTrashInput,
  RestoreTeamFileTrashInput,
  PurgeTeamFileTrashInput,
  TeamFileTrashReceipt,
  TeamFileTrashList,
  TeamFileTrashImpact,
} from "../api/generated/b2b";
export type TrashScope = Pick<FileScope, "origin" | "userId" | "workspaceId">;
export type TrashRecord = {
  schema: 1;
  scope: TrashScope;
  versionId: string;
  attempts: number;
} & (
  | { action: "trash"; input: TeamFileTrashInput }
  | {
      action: "restore";
      input: RestoreTeamFileTrashInput & { trashId: string };
    }
  | { action: "purge"; input: PurgeTeamFileTrashInput & { trashId: string } }
);
export const trashKey = (scope: TrashScope) =>
  JSON.stringify([scope.origin, scope.userId, scope.workspaceId]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
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
export const trashHash = (record: TrashRecord) =>
  bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(canonical(record.input)))),
  );
export const sameTrashIntent = (a: TrashRecord, b: TrashRecord) =>
  a.versionId === b.versionId &&
  a.action === b.action &&
  JSON.stringify(canonical({ ...a.input, requestKey: undefined })) ===
    JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validTrash(
  raw: unknown,
  scope: TrashScope,
): raw is TrashRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as TrashRecord;
  if (
    r.schema !== 1 ||
    !r.scope ||
    trashKey(r.scope) !== trashKey(scope) ||
    !uuid.test(r.scope.userId) ||
    !uuid.test(r.scope.workspaceId) ||
    !r.input ||
    !uuid.test(r.input.requestKey) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0
  )
    return false;
  if (
    !["trash", "restore", "purge"].includes(r.action) ||
    !uuid.test(r.versionId)
  )
    return false;
  if (
    typeof r.input.reason !== "string" ||
    r.input.reason.trim() !== r.input.reason ||
    !r.input.reason.length ||
    r.input.reason.length > 500 ||
    !Number.isInteger(r.input.revision) ||
    r.input.revision < 0 ||
    r.input.revision >= 2147483647
  )
    return false;
  if (r.action === "purge")
    return uuid.test(r.input.trashId) && r.input.confirmIrreversible === true;
  if (
    r.action === "trash"
      ? r.input.versionId !== r.versionId
      : !uuid.test(r.input.trashId)
  )
    return false;
  return (
    typeof r.input.fromLibrary === "boolean" &&
    (r.input.sourceProjectId === undefined
      ? r.input.fromLibrary
      : uuid.test(r.input.sourceProjectId))
  );
}
export function trashApi(scope: TrashScope) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  const e = encodeURIComponent,
    root = `/workspaces/${e(scope.workspaceId)}/b2b/file-trash`;
  const options = (signal?: AbortSignal) => ({
    signal,
    timeout: 15000,
    headers: { "X-Prepix-Account-ID": scope.userId },
  });
  const check = <T extends { currentUserId: string }>(result: T) => {
    if (result.currentUserId !== scope.userId)
      throw new Error("B2B_FILE_ACCOUNT_CHANGED");
    return result;
  };
  const get = async <T extends { currentUserId: string }>(
    path: string,
    signal?: AbortSignal,
  ) =>
    check(
      (await apiClient.get<{ data: T }>(root + path, options(signal))).data
        .data,
    );
  const post = async (path: string, body: unknown, signal: AbortSignal) =>
    check(
      (
        await apiClient.post<{ data: TeamFileTrashReceipt }>(
          root + path,
          body,
          options(signal),
        )
      ).data.data,
    );
  return {
    impact: (version: string, signal: AbortSignal) =>
      get<TeamFileTrashImpact>(`/versions/${e(version)}/impact`, signal),
    list: (signal: AbortSignal, cursor?: string) =>
      get<TeamFileTrashList>(`${cursor ? `?cursor=${e(cursor)}` : ""}`, signal),
    operation: (
      action: TrashRecord["action"],
      key: string,
      hash: string,
      signal: AbortSignal,
    ) =>
      get<{
        currentUserId: string;
        receipt: Omit<TeamFileTrashReceipt, "currentUserId"> | null;
      }>(`/operations/${action}/${e(key)}?inputHash=${e(hash)}`, signal),
    apply: (record: TrashRecord, signal: AbortSignal) => {
      if (!validTrash(record, scope))
        throw new Error("B2B_FILE_OPERATION_INVALID");
      if (record.action === "trash") return post("", record.input, signal);
      const { trashId, ...body } = record.input;
      return post(`/entries/${e(trashId)}/${record.action}`, body, signal);
    },
  };
}
export interface TrashStore {
  list(scope: TrashScope): Promise<TrashRecord[]>;
  prepare(record: TrashRecord): Promise<TrashRecord>;
  start(record: TrashRecord): Promise<TrashRecord>;
  finish(record: TrashRecord): Promise<void>;
  rejectFirst(record: TrashRecord): Promise<void>;
}
export class BrowserTrashStore implements TrashStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-file-trash", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("operations");
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = r.onblocked = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  async list(scope: TrashScope) {
    const db = await this.open();
    return new Promise<TrashRecord[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"),
        read = tx.objectStore("operations").get(trashKey(scope));
      tx.oncomplete = () =>
        read.result && !validTrash(read.result, scope)
          ? reject(new Error("B2B_FILE_OPERATION_INVALID"))
          : resolve(read.result ? [read.result] : []);
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  private async change<T>(
    r: TrashRecord,
    apply: (prior?: TrashRecord) => { next?: TrashRecord; value: T },
  ) {
    if (!validTrash(r, r.scope)) throw new Error("B2B_FILE_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"),
        store = tx.objectStore("operations"),
        read = store.get(trashKey(r.scope));
      let value: T, failure: unknown;
      read.onsuccess = () => {
        try {
          if (read.result && !validTrash(read.result, r.scope))
            throw new Error("B2B_FILE_OPERATION_INVALID");
          const result = apply(read.result);
          value = result.value;
          if (result.next) store.put(result.next, trashKey(r.scope));
          else store.delete(trashKey(r.scope));
        } catch (e) {
          failure = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () =>
        reject(failure ?? new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  prepare(r: TrashRecord) {
    return this.change(r, (prior) => {
      if (prior && !sameTrashIntent(prior, r))
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = prior ?? r;
      return { next, value: next };
    });
  }
  start(r: TrashRecord) {
    return this.change(r, (prior) => {
      if (
        !prior ||
        prior.input.requestKey !== r.input.requestKey ||
        !sameTrashIntent(prior, r)
      )
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = { ...prior, attempts: prior.attempts + 1 };
      return { next, value: next };
    });
  }
  finish(r: TrashRecord) {
    return this.change(r, (prior) => {
      if (prior && prior.input.requestKey !== r.input.requestKey)
        throw new Error("B2B_FILE_OPERATION_PENDING");
      return { value: undefined };
    });
  }
  rejectFirst(r: TrashRecord) {
    return this.change(r, (prior) => ({
      next:
        prior?.input.requestKey === r.input.requestKey &&
        prior.attempts === 1 &&
        r.attempts === 1
          ? undefined
          : prior,
      value: undefined,
    }));
  }
}
type Api = Pick<ReturnType<typeof trashApi>, "operation" | "apply">;
function receiptValid(
  r: TrashRecord,
  receipt: Omit<TeamFileTrashReceipt, "currentUserId">,
) {
  const state =
    r.action === "trash"
      ? "trashed"
      : r.action === "restore"
        ? "restored"
        : "purge_requested";
  if (
    !uuid.test(receipt.requestId) ||
    !uuid.test(receipt.trashId) ||
    receipt.versionId !== r.versionId ||
    receipt.state !== state ||
    receipt.revision !== (r.action === "trash" ? 0 : r.input.revision + 1) ||
    (r.action !== "trash" && receipt.trashId !== r.input.trashId)
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
}
export async function checkTrash(
  r: TrashRecord,
  api: Api,
  store: TrashStore,
  signal: AbortSignal,
) {
  const result = await api.operation(
    r.action,
    r.input.requestKey,
    trashHash(r),
    signal,
  );
  signal.throwIfAborted();
  if (result.currentUserId !== r.scope.userId)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  if (result.receipt) {
    receiptValid(r, result.receipt);
    await store.finish(r);
  }
  return result.receipt;
}
export async function runTrash(
  r: TrashRecord,
  api: Api,
  store: TrashStore,
  signal: AbortSignal,
) {
  const prepared = await store.prepare(r);
  signal.throwIfAborted();
  const found = await checkTrash(prepared, api, store, signal);
  if (found) return found;
  const started = await store.start(prepared);
  signal.throwIfAborted();
  try {
    const result = await api.apply(started, signal);
    signal.throwIfAborted();
    if (result.currentUserId !== r.scope.userId)
      throw new Error("B2B_FILE_ACCOUNT_CHANGED");
    receiptValid(started, result);
    await store.finish(started);
    return result;
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (
      status &&
      status >= 400 &&
      status < 500 &&
      status !== 408 &&
      status !== 429
    )
      await store.rejectFirst(started);
    throw e;
  }
}
