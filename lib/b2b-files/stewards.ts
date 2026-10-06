import { apiClient } from "../api/client";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { FileScope } from "./api";
import type {
  TeamFileStewardInput,
  TeamFileStewardLookup,
  TeamFileStewardOperation,
  TeamFileStewardReceipt,
  TeamFileStewardRecoveryList,
  TransferTeamFileStewardInput,
} from "../api/generated/b2b";

export type StewardScope = Pick<FileScope, "origin" | "userId" | "workspaceId">;
export type StewardRecord = {
  schema: 1;
  scope: StewardScope;
  attempts: number;
} & (
  | { action: "transfer"; input: TransferTeamFileStewardInput }
  | { action: "request"; input: TeamFileStewardInput }
  | {
      action: "accept";
      input: {
        requestKey: string;
        recoveryId: string;
        acceptVersionAccess: true;
      };
    }
  | {
      action: "cancel";
      input: { requestKey: string; recoveryId: string; reason: string };
    }
);
export const stewardKey = (scope: StewardScope) =>
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
export const stewardHash = (record: StewardRecord) =>
  bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(canonical(record.input)))),
  );
export const sameStewardIntent = (a: StewardRecord, b: StewardRecord) =>
  a.action === b.action &&
  JSON.stringify(canonical({ ...a.input, requestKey: undefined })) ===
    JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validSteward(
  raw: unknown,
  scope: StewardScope,
): raw is StewardRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as StewardRecord;
  if (
    r.schema !== 1 ||
    !r.scope ||
    stewardKey(r.scope) !== stewardKey(scope) ||
    !uuid.test(r.scope.userId) ||
    !uuid.test(r.scope.workspaceId) ||
    !r.input ||
    !uuid.test(r.input.requestKey) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0
  )
    return false;
  if (r.action === "accept")
    return (
      uuid.test(r.input.recoveryId) && r.input.acceptVersionAccess === true
    );
  if (!["transfer", "request", "cancel"].includes(r.action)) return false;
  if (
    typeof r.input.reason !== "string" ||
    r.input.reason.trim() !== r.input.reason ||
    !r.input.reason.length ||
    r.input.reason.length > 500
  )
    return false;
  if (r.action === "cancel") return uuid.test(r.input.recoveryId);
  if (
    !uuid.test(r.input.versionId) ||
    !uuid.test(r.input.targetId) ||
    r.input.targetId === scope.userId ||
    !Number.isInteger(r.input.revision) ||
    r.input.revision < 0 ||
    r.input.revision >= 2147483647 ||
    typeof r.input.canDownload !== "boolean"
  )
    return false;
  return (
    r.action !== "transfer" ||
    (typeof r.input.fromLibrary === "boolean" &&
      (r.input.sourceProjectId === undefined
        ? r.input.fromLibrary
        : uuid.test(r.input.sourceProjectId)))
  );
}
export function stewardApi(scope: StewardScope) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  const e = encodeURIComponent,
    root = `/workspaces/${e(scope.workspaceId)}/b2b/file-stewards`;
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
        await apiClient.post<{ data: TeamFileStewardReceipt }>(
          root + path,
          body,
          options(signal),
        )
      ).data.data,
    );
  return {
    lookup: (
      version: string,
      source: { sourceProjectId?: string; fromLibrary: boolean },
      signal: AbortSignal,
    ) =>
      get<TeamFileStewardLookup>(
        `/versions/${e(version)}?fromLibrary=${source.fromLibrary}${source.sourceProjectId ? `&sourceProjectId=${e(source.sourceProjectId)}` : ""}`,
        signal,
      ),
    recovery: (version: string, signal: AbortSignal) =>
      get<TeamFileStewardLookup>(`/recovery/${e(version)}`, signal),
    list: (signal: AbortSignal, cursor?: string) =>
      get<TeamFileStewardRecoveryList>(
        `/recoveries${cursor ? `?cursor=${e(cursor)}` : ""}`,
        signal,
      ),
    operation: (
      action: TeamFileStewardOperation,
      key: string,
      hash: string,
      signal: AbortSignal,
    ) =>
      get<{
        currentUserId: string;
        receipt: Omit<TeamFileStewardReceipt, "currentUserId"> | null;
      }>(`/operations/${action}/${e(key)}?inputHash=${e(hash)}`, signal),
    apply: (record: StewardRecord, signal: AbortSignal) => {
      if (!validSteward(record, scope))
        throw new Error("B2B_FILE_OPERATION_INVALID");
      if (record.action === "transfer")
        return post("/transfer", record.input, signal);
      if (record.action === "request")
        return post("/recoveries", record.input, signal);
      const { recoveryId, ...body } = record.input;
      return post(
        `/recoveries/${e(recoveryId)}/${record.action}`,
        body,
        signal,
      );
    },
  };
}
export interface StewardStore {
  list(scope: StewardScope): Promise<StewardRecord[]>;
  prepare(record: StewardRecord): Promise<StewardRecord>;
  start(record: StewardRecord): Promise<StewardRecord>;
  finish(record: StewardRecord): Promise<void>;
  rejectFirst(record: StewardRecord): Promise<void>;
}
export class BrowserStewardStore implements StewardStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-file-stewards", 1);
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
  async list(scope: StewardScope) {
    const db = await this.open();
    return new Promise<StewardRecord[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"),
        read = tx.objectStore("operations").get(stewardKey(scope));
      tx.oncomplete = () =>
        read.result && !validSteward(read.result, scope)
          ? reject(new Error("B2B_FILE_OPERATION_INVALID"))
          : resolve(read.result ? [read.result] : []);
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  private async change<T>(
    r: StewardRecord,
    apply: (prior?: StewardRecord) => { next?: StewardRecord; value: T },
  ) {
    if (!validSteward(r, r.scope))
      throw new Error("B2B_FILE_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"),
        store = tx.objectStore("operations"),
        read = store.get(stewardKey(r.scope));
      let value: T, failure: unknown;
      read.onsuccess = () => {
        try {
          if (read.result && !validSteward(read.result, r.scope))
            throw new Error("B2B_FILE_OPERATION_INVALID");
          const result = apply(read.result);
          value = result.value;
          if (result.next) store.put(result.next, stewardKey(r.scope));
          else store.delete(stewardKey(r.scope));
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
  prepare(r: StewardRecord) {
    return this.change(r, (prior) => {
      if (prior && !sameStewardIntent(prior, r))
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = prior ?? r;
      return { next, value: next };
    });
  }
  start(r: StewardRecord) {
    return this.change(r, (prior) => {
      if (
        !prior ||
        prior.input.requestKey !== r.input.requestKey ||
        !sameStewardIntent(prior, r)
      )
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = { ...prior, attempts: prior.attempts + 1 };
      return { next, value: next };
    });
  }
  finish(r: StewardRecord) {
    return this.change(r, (prior) => {
      if (prior && prior.input.requestKey !== r.input.requestKey)
        throw new Error("B2B_FILE_OPERATION_PENDING");
      return { value: undefined };
    });
  }
  rejectFirst(r: StewardRecord) {
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
type Api = Pick<ReturnType<typeof stewardApi>, "operation" | "apply">;
function receiptValid(
  r: StewardRecord,
  receipt: Omit<TeamFileStewardReceipt, "currentUserId">,
) {
  if (
    !uuid.test(receipt.requestId) ||
    !Number.isInteger(receipt.revision) ||
    receipt.revision < 0 ||
    (receipt.recoveryId !== undefined && !uuid.test(receipt.recoveryId))
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
  if (r.action === "transfer") {
    if (
      receipt.revision !== r.input.revision + 1 ||
      receipt.recoveryId !== undefined
    )
      throw new Error("B2B_FILE_OPERATION_INVALID");
  } else {
    if (
      !receipt.recoveryId ||
      (r.action === "request"
        ? receipt.revision !== r.input.revision
        : receipt.recoveryId !== r.input.recoveryId)
    )
      throw new Error("B2B_FILE_OPERATION_INVALID");
  }
}
export async function checkSteward(
  r: StewardRecord,
  api: Api,
  store: StewardStore,
  signal: AbortSignal,
) {
  const result = await api.operation(
    r.action,
    r.input.requestKey,
    stewardHash(r),
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
export async function runSteward(
  r: StewardRecord,
  api: Api,
  store: StewardStore,
  signal: AbortSignal,
) {
  const prepared = await store.prepare(r);
  signal.throwIfAborted();
  const found = await checkSteward(prepared, api, store, signal);
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
