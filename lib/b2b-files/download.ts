import type { FileApi } from "./api";
import { downloadUrl } from "./download-engine";
import {
  downloadDirectory,
  downloadKey,
  downloadName,
  type DownloadRecord,
} from "./download-store";
export type DownloadProgress = (
  phase: "checking" | "receiving" | "authorizing",
  bytes: number,
) => void;
export async function receiveInBrowser(
  record: DownloadRecord,
  api: Pick<FileApi, "download">,
  signal: AbortSignal,
  progress: DownloadProgress,
  consume: (file: File) => Promise<void>,
) {
  if (!navigator.locks || typeof Worker === "undefined")
    throw new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE");
  return navigator.locks.request(
    downloadKey(record),
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error("B2B_FILE_DOWNLOAD_BUSY");
      signal.throwIfAborted();
      const file = await new Promise<File>((resolve, reject) => {
        const worker = new Worker(
          new URL("./download.worker.ts", import.meta.url),
        );
        let settled = false,
          abortTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (file?: File, error?: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(abortTimer);
          signal.removeEventListener("abort", abort);
          worker.terminate();
          if (error) reject(error);
          else resolve(file!);
        };
        const abort = () => {
          worker.postMessage({ abort: true });
          abortTimer = setTimeout(
            () => finish(undefined, new DOMException("Paused", "AbortError")),
            1000,
          );
        };
        signal.addEventListener("abort", abort, { once: true });
        worker.onerror = () =>
          finish(undefined, new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE"));
        worker.onmessage = async ({ data }) => {
          if (settled) return;
          if (signal.aborted) {
            if (data.error || data.file)
              finish(undefined, new DOMException("Paused", "AbortError"));
            return;
          }
          if (data.ticketNeeded || data.verified) {
            try {
              if (data.verified) {
                progress("authorizing", record.size);
                worker.postMessage({ release: true });
                return;
              }
              const ticket = await api.download(record.versionId, signal);
              signal.throwIfAborted();
              downloadUrl(
                ticket,
                record,
                process.env.NODE_ENV === "development",
              );
              worker.postMessage({ ticket });
            } catch (e) {
              worker.postMessage({ abort: true });
              finish(undefined, e);
            }
          } else if (data.file instanceof File) {
            if (data.file.size !== record.size)
              finish(undefined, new Error("B2B_FILE_DOWNLOAD_INTEGRITY"));
            else finish(data.file);
          } else if (typeof data.error === "string")
            finish(undefined, new Error(data.error));
          else if (
            ["checking", "receiving"].includes(data.phase) &&
            Number.isSafeInteger(data.bytes) &&
            data.bytes >= 0 &&
            data.bytes <= record.size
          )
            progress(data.phase, data.bytes);
        };
        worker.postMessage({
          record,
          development: process.env.NODE_ENV === "development",
        });
      });
      signal.throwIfAborted();
      await consume(file);
    },
  );
}
export async function discardReceipt(record: DownloadRecord) {
  if (!navigator.locks)
    throw new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE");
  await navigator.locks.request(
    downloadKey(record),
    { ifAvailable: true },
    async (lock) => {
      if (!lock) throw new Error("B2B_FILE_DOWNLOAD_BUSY");
      const directory = await downloadDirectory();
      await directory.removeEntry(downloadName(record)).catch((e) => {
        if (e?.name !== "NotFoundError") throw e;
      });
    },
  );
}
