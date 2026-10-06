import { apiClient } from "../api/client";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  ProjectRequestMutationAction,
  ProjectRequestMutationLookup,
  ProjectRequestMutationResult,
} from "../api/generated/b2b";
export type RequestScope = {
  origin: string;
  userId: string;
  workspaceId: string;
  projectId: string;
};
export type RequestRecord = {
  schema: 1;
  scope: RequestScope;
  action: ProjectRequestMutationAction;
  target?: string;
  submissionId?: string;
  input: { requestKey: string } & Record<string, unknown>;
  attempts: number;
};
export const requestKey = (s: RequestScope) =>
  JSON.stringify([s.origin, s.userId, s.workspaceId, s.projectId]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
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
export const requestHash = (r: RequestRecord) =>
  bytesToHex(
    sha256(new TextEncoder().encode(JSON.stringify(canonical(r.input)))),
  );
export const sameRequestIntent = (a: RequestRecord, b: RequestRecord) =>
  a.action === b.action &&
  a.target === b.target &&
  a.submissionId === b.submissionId &&
  JSON.stringify(canonical({ ...a.input, requestKey: undefined })) ===
    JSON.stringify(canonical({ ...b.input, requestKey: undefined }));
export function validRequest(
  raw: unknown,
  scope: RequestScope,
): raw is RequestRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as RequestRecord;
  if (
    r.schema !== 1 ||
    !r.scope ||
    requestKey(r.scope) !== requestKey(scope) ||
    !uuid.test(scope.userId) ||
    !uuid.test(scope.workspaceId) ||
    !uuid.test(scope.projectId) ||
    !r.input ||
    !uuid.test(r.input.requestKey) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0
  )
    return false;
  if (
    ![
      "create",
      "update",
      "accept",
      "close",
      "reopen",
      "submit",
      "decide",
    ].includes(r.action) ||
    (r.action === "create"
      ? r.target !== undefined
      : !uuid.test(r.target ?? "")) ||
    (r.action === "decide"
      ? !uuid.test(r.submissionId ?? "")
      : r.submissionId !== undefined)
  )
    return false;
  if (
    ["update", "accept", "close", "reopen"].includes(r.action) &&
    (!Number.isInteger(r.input.revision) || (r.input.revision as number) < 0)
  )
    return false;
  if (
    r.action === "submit" &&
    (!Number.isInteger(r.input.requestRevision) ||
      (r.input.requestRevision as number) < 1 ||
      !Array.isArray(r.input.versionIds) ||
      r.input.versionIds.length > 20 ||
      r.input.versionIds.some((id) => typeof id !== "string" || !uuid.test(id)))
  )
    return false;
  if (
    r.action === "decide" &&
    !["confirmed", "returned"].includes(r.input.decision as string)
  )
    return false;
  if (
    ["close", "reopen"].includes(r.action) &&
    (typeof r.input.reason !== "string" ||
      !r.input.reason.trim() ||
      r.input.reason.length > 1000)
  )
    return false;
  if (
    ["create", "update", "accept"].includes(r.action) &&
    (typeof r.input.title !== "string" ||
      !r.input.title.trim() ||
      r.input.title.length > 100 ||
      typeof r.input.body !== "string" ||
      !r.input.body.trim() ||
      r.input.body.length > 5000)
  )
    return false;
  try {
    if (new URL(scope.origin).origin !== scope.origin) return false;
  } catch {
    return false;
  }
  return true;
}
export const requestEvents = "prepix-b2b-request-changed";
export function requestsApi(scope: RequestScope) {
  const e = encodeURIComponent,
    root = `/workspaces/${e(scope.workspaceId)}/b2b/projects/${e(scope.projectId)}/requests`;
  const options = (signal: AbortSignal) => {
    if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
      throw new Error("B2B_FILE_SERVICE_CHANGED");
    return {
      signal,
      timeout: 15000,
      headers: { "X-Prepix-Account-ID": scope.userId },
    };
  };
  const query = (r: RequestRecord) =>
    new URLSearchParams({
      inputHash: requestHash(r),
      ...(r.target ? { target: r.target } : {}),
      ...(r.submissionId ? { submissionId: r.submissionId } : {}),
    }).toString();
  return {
    operation: async (r: RequestRecord, signal: AbortSignal) =>
      (
        await apiClient.get<{ data: ProjectRequestMutationLookup }>(
          `${root}/operations/${r.action}/${e(r.input.requestKey)}?${query(r)}`,
          options(signal),
        )
      ).data.data,
    apply: async (r: RequestRecord, signal: AbortSignal) => {
      if (!validRequest(r, scope))
        throw new Error("B2B_FILE_OPERATION_INVALID");
      const path =
        r.action === "create"
          ? ""
          : r.action === "update"
            ? `/${e(r.target!)}`
            : r.action === "submit"
              ? `/${e(r.target!)}/submissions`
              : r.action === "decide"
                ? `/${e(r.target!)}/submissions/${e(r.submissionId!)}/confirmations`
                : `/${e(r.target!)}/${r.action}`;
      await apiClient.post(root + path, r.input, options(signal));
    },
  };
}
export interface RequestStore {
  list(scope: RequestScope): Promise<RequestRecord[]>;
  prepare(r: RequestRecord): Promise<RequestRecord>;
  start(r: RequestRecord): Promise<RequestRecord>;
  finish(r: RequestRecord): Promise<void>;
  rejectFirst(r: RequestRecord): Promise<void>;
}
export class BrowserRequestStore implements RequestStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-project-requests", 1);
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
  async list(scope: RequestScope) {
    const db = await this.open();
    return new Promise<RequestRecord[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"),
        read = tx.objectStore("operations").get(requestKey(scope));
      tx.oncomplete = () =>
        read.result && !validRequest(read.result, scope)
          ? reject(new Error("B2B_FILE_OPERATION_INVALID"))
          : resolve(read.result ? [read.result] : []);
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  private async change<T>(
    r: RequestRecord,
    apply: (prior?: RequestRecord) => { next?: RequestRecord; value: T },
  ) {
    if (!validRequest(r, r.scope))
      throw new Error("B2B_FILE_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"),
        store = tx.objectStore("operations"),
        read = store.get(requestKey(r.scope));
      let value: T, failure: unknown;
      read.onsuccess = () => {
        try {
          if (read.result && !validRequest(read.result, r.scope))
            throw new Error("B2B_FILE_OPERATION_INVALID");
          const result = apply(read.result);
          value = result.value;
          if (result.next) store.put(result.next, requestKey(r.scope));
          else store.delete(requestKey(r.scope));
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
  prepare(r: RequestRecord) {
    return this.change(r, (prior) => {
      if (prior && !sameRequestIntent(prior, r))
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = prior ?? r;
      return { next, value: next };
    });
  }
  start(r: RequestRecord) {
    return this.change(r, (prior) => {
      if (
        !prior ||
        prior.input.requestKey !== r.input.requestKey ||
        !sameRequestIntent(prior, r)
      )
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = { ...prior, attempts: prior.attempts + 1 };
      return { next, value: next };
    });
  }
  finish(r: RequestRecord) {
    return this.change(r, (prior) => {
      if (prior && prior.input.requestKey !== r.input.requestKey)
        throw new Error("B2B_FILE_OPERATION_PENDING");
      return { value: undefined };
    });
  }
  rejectFirst(r: RequestRecord) {
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
type Api = ReturnType<typeof requestsApi>;
function receiptValid(r: RequestRecord, v: ProjectRequestMutationResult) {
  if (
    !v ||
    !uuid.test(v.requestId) ||
    !v.request ||
    !uuid.test(v.request.id) ||
    (r.target && v.request.id !== r.target) ||
    !Number.isInteger(v.request.revision) ||
    v.request.revision < 0 ||
    ![
      "proposed",
      "open",
      "submitted",
      "confirmed",
      "waived",
      "cancelled",
      "declined",
    ].includes(v.request.state)
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
  if (
    ["update", "accept", "close", "reopen"].includes(r.action) &&
    v.request.revision !== Number(r.input.revision) + 1
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
  if (
    r.action === "submit" &&
    (!uuid.test(v.submissionId ?? "") || v.request.state !== "submitted")
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
  if (
    r.action === "decide" &&
    (!uuid.test(v.confirmationId ?? "") ||
      v.request.state !==
        (r.input.decision === "confirmed" ? "confirmed" : "open"))
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
  if (
    (r.action === "accept" && v.request.state !== "open") ||
    (r.action === "close" &&
      !["waived", "cancelled", "declined"].includes(v.request.state)) ||
    (r.action === "reopen" &&
      !["open", "proposed"].includes(v.request.state)) ||
    (r.action === "create" &&
      (v.request.revision !== 0 ||
        !["open", "proposed"].includes(v.request.state)))
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
}
export async function checkRequest(
  r: RequestRecord,
  api: Api,
  store: RequestStore,
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
export async function runRequest(
  r: RequestRecord,
  api: Api,
  store: RequestStore,
  signal: AbortSignal,
) {
  const prepared = await store.prepare(r);
  signal.throwIfAborted();
  const found = await checkRequest(prepared, api, store, signal);
  if (found) return found;
  const started = await store.start(prepared);
  signal.throwIfAborted();
  try {
    await api.apply(started, signal);
    signal.throwIfAborted();
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
  // Only this actor's server receipt clears an intent, including after a lost
  // POST body. An empty lookup stays pending; it never starts a new operation.
  const receipt = await checkRequest(started, api, store, signal);
  if (!receipt) throw new Error("B2B_FILE_OPERATION_PENDING");
  return receipt;
}
