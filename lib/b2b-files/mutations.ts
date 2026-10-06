import { isDirectLibrary, LIBRARY_SOURCE } from "./api";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { ChangeTeamFilePermissionInput } from "../api/generated/b2b";
import type { FileApi, FileScope } from "./api";
import { scopeKey, teamFilePrefix } from "./store";

type Base = { schema: 1; scope: FileScope; attempts: number };
export type FileMutation = Base &
  (
    | {
        kind: "permission";
        objectId: string;
        input: ChangeTeamFilePermissionInput;
      }
    | {
        kind: "link";
        objectId: string;
        targetProjectId: string;
        input: {
          requestKey: string;
          sourceProjectId?: string;
          versionId: string;
          fromLibrary?: boolean;
        };
      }
    | {
        kind: "unlink";
        objectId: string;
        input: { requestKey: string; revision: number; reason: string };
      }
  );
export type FileReceipt = { requestId: string; revision: number };
export const operationProject = (r: FileMutation) =>
  r.kind === "link" ? r.targetProjectId : r.scope.projectId;
export const mutationKey = (r: FileMutation) =>
  JSON.stringify([
    scopeKey(r.scope),
    r.kind,
    r.objectId,
    r.kind === "permission"
      ? r.input.userId
      : r.kind === "link"
        ? r.targetProjectId
        : "",
  ]);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validMutation(
  raw: unknown,
  scope: FileScope,
): raw is FileMutation {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as FileMutation;
  if (
    r.schema !== 1 ||
    !r.scope ||
    scopeKey(r.scope) !== scopeKey(scope) ||
    (scope.projectId === LIBRARY_SOURCE &&
      (!isDirectLibrary(scope) || !isDirectLibrary(r.scope))) ||
    !["permission", "link", "unlink"].includes(r.kind) ||
    !uuid.test(r.objectId) ||
    !r.input ||
    !uuid.test(r.input.requestKey) ||
    !Number.isSafeInteger(r.attempts) ||
    r.attempts < 0
  )
    return false;
  if (r.kind === "link")
    return (
      uuid.test(r.targetProjectId) &&
      (r.targetProjectId !== scope.projectId || r.input.fromLibrary === true) &&
      (r.input.fromLibrary === undefined ||
        typeof r.input.fromLibrary === "boolean") &&
      (isDirectLibrary(scope)
        ? r.input.sourceProjectId === undefined && r.input.fromLibrary === true
        : r.input.sourceProjectId === scope.projectId) &&
      r.input.versionId === r.objectId
    );
  return (
    !isDirectLibrary(scope) &&
    Number.isInteger(r.input.revision) &&
    r.input.revision >= 0 &&
    r.input.revision < 2147483647 &&
    typeof r.input.reason === "string" &&
    r.input.reason.trim() === r.input.reason &&
    r.input.reason.length > 0 &&
    r.input.reason.length <= 500 &&
    (r.kind === "unlink" ||
      (uuid.test(r.input.userId) &&
        typeof r.input.canDownload === "boolean" &&
        typeof r.input.canUseForAi === "boolean" &&
        (r.input.remove === undefined || typeof r.input.remove === "boolean")))
  );
}
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
export function mutationBody(r: FileMutation) {
  if (r.kind === "permission")
    return {
      ...r.input,
      projectId: r.scope.projectId,
      assetId: r.objectId,
      reason: r.input.reason.trim(),
    };
  if (r.kind === "link") return { ...r.input, projectId: r.targetProjectId };
  return {
    ...r.input,
    projectId: r.scope.projectId,
    versionId: r.objectId,
    reason: r.input.reason.trim(),
  };
}
export const mutationHash = (r: FileMutation) =>
  bytesToHex(
    sha256(
      new TextEncoder().encode(JSON.stringify(canonical(mutationBody(r)))),
    ),
  );
export function sameIntent(a: FileMutation, b: FileMutation) {
  return (
    JSON.stringify(canonical({ ...mutationBody(a), requestKey: undefined })) ===
    JSON.stringify(canonical({ ...mutationBody(b), requestKey: undefined }))
  );
}
export interface MutationStore {
  list(scope: FileScope): Promise<FileMutation[]>;
  prepare(record: FileMutation): Promise<FileMutation>;
  start(record: FileMutation): Promise<FileMutation>;
  rejectFirst(record: FileMutation): Promise<boolean>;
  finish(record: FileMutation): Promise<void>;
}
export class BrowserMutationStore implements MutationStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-file-operations", 1);
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
  async scopes(scope: Omit<FileScope, "projectId">) {
    const db = await this.open(),
      prefix = teamFilePrefix(scope);
    return new Promise<FileScope[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"),
        r = tx
          .objectStore("operations")
          .getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      tx.oncomplete = () =>
        resolve(
          r.result
            .filter(
              (v: FileMutation) =>
                v?.scope &&
                (uuid.test(v.scope.projectId) || isDirectLibrary(v.scope)) &&
                validMutation(v, {
                  ...scope,
                  projectId: v.scope.projectId,
                  library: true,
                }),
            )
            .map((v: FileMutation) => ({
              ...scope,
              projectId: v.scope.projectId,
              library: true,
            })),
        );
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  async list(scope: FileScope) {
    const db = await this.open(),
      prefix = JSON.stringify([scopeKey(scope)]).slice(0, -1) + ",";
    return new Promise<FileMutation[]>((resolve, reject) => {
      const tx = db.transaction("operations", "readonly"),
        r = tx
          .objectStore("operations")
          .getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      tx.oncomplete = () =>
        resolve(r.result.filter((r: unknown) => validMutation(r, scope)));
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  private async change<T>(
    r: FileMutation,
    apply: (prior?: FileMutation) => { next?: FileMutation; value: T },
  ) {
    if (!validMutation(r, r.scope))
      throw new Error("B2B_FILE_OPERATION_INVALID");
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction("operations", "readwrite"),
        store = tx.objectStore("operations"),
        get = store.get(mutationKey(r));
      let value: T, failure: unknown;
      get.onsuccess = () => {
        try {
          if (get.result && !validMutation(get.result, r.scope))
            throw new Error("B2B_FILE_OPERATION_INVALID");
          const result = apply(get.result);
          value = result.value;
          if (result.next) store.put(result.next, mutationKey(r));
          else store.delete(mutationKey(r));
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
  prepare(r: FileMutation) {
    return this.change(r, (prior) => {
      if (prior && !sameIntent(prior, r))
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = prior ?? r;
      return { next, value: next };
    });
  }
  start(r: FileMutation) {
    return this.change(r, (prior) => {
      if (
        !prior ||
        prior.input.requestKey !== r.input.requestKey ||
        !sameIntent(prior, r)
      )
        throw new Error("B2B_FILE_OPERATION_PENDING");
      const next = { ...prior, attempts: prior.attempts + 1 };
      return { next, value: next };
    });
  }
  rejectFirst(r: FileMutation) {
    return this.change(r, (prior) => {
      if (
        prior?.input.requestKey === r.input.requestKey &&
        prior.attempts === 1 &&
        r.attempts === 1
      )
        return { value: true };
      return { next: prior, value: false };
    });
  }
  finish(r: FileMutation) {
    return this.change(r, (prior) => {
      if (prior && prior.input.requestKey !== r.input.requestKey)
        throw new Error("B2B_FILE_OPERATION_PENDING");
      return { value: undefined };
    });
  }
}
export type MutationApi = Pick<
  FileApi,
  "operation" | "changePermission" | "link" | "unlink"
>;
function checkReceipt(receipt: FileReceipt) {
  if (
    !uuid.test(receipt.requestId) ||
    !Number.isInteger(receipt.revision) ||
    receipt.revision < 0
  )
    throw new Error("B2B_FILE_OPERATION_INVALID");
}
export async function checkMutation(
  r: FileMutation,
  api: MutationApi,
  store: MutationStore,
  signal: AbortSignal,
) {
  const result = await api.operation(
    r.kind,
    r.input.requestKey,
    mutationHash(r),
    signal,
  );
  signal.throwIfAborted();
  if (result.currentUserId !== r.scope.userId)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  if (result.receipt) {
    checkReceipt(result.receipt);
    await store.finish(r);
  }
  return result.receipt;
}
export async function runMutation(
  r: FileMutation,
  api: MutationApi,
  store: MutationStore,
  signal: AbortSignal,
) {
  const record = await store.prepare(r);
  signal.throwIfAborted();
  const found = await checkMutation(record, api, store, signal);
  if (found) return found;
  const started = await store.start(record);
  signal.throwIfAborted();
  try {
    const result =
      started.kind === "permission"
        ? await api.changePermission(started.objectId, started.input, signal)
        : started.kind === "link"
          ? await api.link(started.input, signal)
          : await api.unlink(started.objectId, started.input, signal);
    signal.throwIfAborted();
    if (result.projectId !== operationProject(started))
      throw new Error("B2B_FILE_OPERATION_INVALID");
    checkReceipt(result);
    await store.finish(started);
    return result;
  } catch (e) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    // Only a single first attempt with a definitive server rejection can free
    // the topic. A later 403/409 cannot disprove an earlier lost success reply.
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
