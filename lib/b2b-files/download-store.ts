import { bytesToHex } from "@noble/hashes/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { FileScope } from "./api";
import { scopeKey } from "./store";
import type { DownloadIdentity } from "./download-engine";
export type DownloadRecord = DownloadIdentity & {
  schema: 1;
  scope: FileScope;
  versionId: string;
};
export const downloadKey = (r: DownloadRecord) =>
  JSON.stringify([scopeKey(r.scope), r.versionId]);
export const downloadName = (r: DownloadRecord) =>
  bytesToHex(sha256(new TextEncoder().encode(downloadKey(r))));
export const DOWNLOAD_DIRECTORY = "prepix-private-receipts";
export function validDownload(
  value: unknown,
  scope: FileScope,
): value is DownloadRecord {
  const r = value as DownloadRecord;
  return (
    !!r &&
    r.schema === 1 &&
    !!r.scope &&
    scopeKey(r.scope) === scopeKey(scope) &&
    /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(r.versionId) &&
    Number.isSafeInteger(r.size) &&
    r.size > 0 &&
    /^[a-f0-9]{64}$/.test(r.sha256)
  );
}
export class BrowserDownloadStore {
  private opening?: Promise<IDBDatabase>;
  private open() {
    this.opening ??= new Promise((resolve, reject) => {
      const r = indexedDB.open("prepix-b2b-file-receipts", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("receipts");
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = r.onblocked = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
    return this.opening;
  }
  async list(scope: FileScope) {
    const db = await this.open(),
      prefix = JSON.stringify([scopeKey(scope)]).slice(0, -1) + ",";
    return new Promise<DownloadRecord[]>((resolve, reject) => {
      const tx = db.transaction("receipts", "readonly"),
        r = tx
          .objectStore("receipts")
          .getAll(IDBKeyRange.bound(prefix, prefix + "\uffff"));
      tx.oncomplete = () =>
        resolve(r.result.filter((r: unknown) => validDownload(r, scope)));
      tx.onabort = tx.onerror = () =>
        reject(new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  private async change(r: DownloadRecord, remove: boolean) {
    if (!validDownload(r, r.scope))
      throw new Error("B2B_FILE_DOWNLOAD_INVALID");
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction("receipts", "readwrite"),
        store = tx.objectStore("receipts"),
        get = store.get(downloadKey(r));
      let error: unknown;
      get.onsuccess = () => {
        if (
          get.result &&
          (!validDownload(get.result, r.scope) ||
            get.result.sha256 !== r.sha256 ||
            get.result.size !== r.size)
        ) {
          error = new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
          tx.abort();
          return;
        }
        if (remove) store.delete(downloadKey(r));
        else store.put(r, downloadKey(r));
      };
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(error ?? new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE"));
    });
  }
  save(r: DownloadRecord) {
    return this.change(r, false);
  }
  remove(r: DownloadRecord) {
    return this.change(r, true);
  }
}
export async function downloadDirectory() {
  if (!navigator.storage?.getDirectory)
    throw new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE");
  return (await navigator.storage.getDirectory()).getDirectoryHandle(
    DOWNLOAD_DIRECTORY,
    { create: true },
  );
}
