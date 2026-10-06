import type { BeginTeamFileUploadInput } from "../api/generated/b2b";
import type { FileScope } from "./api";

export type TransferRecord = {
  schema: 1;
  scope: FileScope;
  input: BeginTeamFileUploadInput;
  uploadId?: string;
  cancelRequested: boolean;
};
export interface TransferStore {
  list(scope: FileScope): Promise<TransferRecord[]>;
  save(record: TransferRecord): Promise<TransferRecord>;
  remove(record: TransferRecord): Promise<void>;
}
export const scopeKey = (scope: FileScope) =>
  JSON.stringify([
    scope.origin,
    scope.userId,
    scope.workspaceId,
    scope.projectId,
  ]);
export const recordKey = (record: TransferRecord) =>
  JSON.stringify([scopeKey(record.scope), record.input.requestKey]);
// A trailing tuple comma makes the range account/team/service exact, even
// for prefixes containing JSON quotes or backslashes.
export const teamFilePrefix = (scope: Omit<FileScope, "projectId">) =>
  JSON.stringify([
    JSON.stringify([scope.origin, scope.userId, scope.workspaceId]).slice(
      0,
      -1,
    ) + ",",
  ]).slice(0, -2);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validRecord(
  raw: unknown,
  scope: FileScope,
): raw is TransferRecord {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as TransferRecord,
    i = r.input;
  return (
    r.schema === 1 &&
    !!r.scope &&
    scopeKey(r.scope) === scopeKey(scope) &&
    !!i &&
    uuid.test(i.requestKey) &&
    typeof i.name === "string" &&
    i.name.length > 0 &&
    i.name.length <= 255 &&
    !/[\\/\u0000-\u001f\u007f]/.test(i.name) &&
    i.name !== "." &&
    i.name !== ".." &&
    Number.isSafeInteger(i.size) &&
    i.size > 0 &&
    /^[a-f0-9]{64}$/.test(i.sha256) &&
    ["original", "output", "working"].includes(i.kind) &&
    i.scope === "uploader_and_steward" &&
    (i.existingAssetId === undefined || uuid.test(i.existingAssetId)) &&
    (r.uploadId === undefined || uuid.test(r.uploadId)) &&
    typeof r.cancelRequested === "boolean"
  );
}
export function mergeRecord(
  existing: TransferRecord | undefined,
  next: TransferRecord,
): TransferRecord {
  if (!validRecord(next, next.scope))
    throw new Error("B2B_FILE_TRANSFER_RECORD_INVALID");
  if (!existing) return next;
  if (
    !validRecord(existing, next.scope) ||
    recordKey(existing) !== recordKey(next) ||
    JSON.stringify(existing.input) !== JSON.stringify(next.input) ||
    (existing.uploadId && next.uploadId && existing.uploadId !== next.uploadId)
  )
    throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
  // An in-flight transfer must never overwrite a cancellation from another tab.
  return {
    ...next,
    uploadId: existing.uploadId ?? next.uploadId,
    cancelRequested: existing.cancelRequested || next.cancelRequested,
  };
}
/** Only transfer intent persists. No token, signed URL, multipart secret or file
 * bytes are recorded. Storage failure blocks the corresponding network write. */
export class BrowserTransferStore implements TransferStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("prepix-b2b-file-transfers", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("transfers");
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
      request.onblocked = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  async list(scope: FileScope) {
    const db = await this.open();
    return new Promise<TransferRecord[]>((resolve, reject) => {
      const tx = db.transaction("transfers", "readonly"),
        request = tx.objectStore("transfers").getAll();
      tx.oncomplete = () =>
        resolve(request.result.filter((r: unknown) => validRecord(r, scope)));
      tx.onerror = tx.onabort = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  async save(record: TransferRecord) {
    const db = await this.open();
    return new Promise<TransferRecord>((resolve, reject) => {
      const tx = db.transaction("transfers", "readwrite"),
        store = tx.objectStore("transfers"),
        request = store.get(recordKey(record));
      let saved: TransferRecord, failure: unknown;
      request.onsuccess = () => {
        try {
          saved = mergeRecord(request.result, record);
          store.put(saved, recordKey(saved));
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(saved);
      tx.onerror = tx.onabort = () =>
        reject(failure ?? new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  async remove(record: TransferRecord) {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("transfers", "readwrite");
      tx.objectStore("transfers").delete(recordKey(record));
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
}
