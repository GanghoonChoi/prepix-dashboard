import { receiveVerifiedFile, type DownloadStage } from "./download-engine";
import {
  downloadDirectory,
  downloadName,
  type DownloadRecord,
} from "./download-store";
import type { TeamFileDownload } from "../api/generated/b2b";
type SyncFile = {
  getSize(): number;
  read(bytes: Uint8Array, options: { at: number }): number;
  write(bytes: Uint8Array, options: { at: number }): number;
  flush(): void;
  truncate(size: number): void;
  close(): void;
};
type Inbound =
  | { record: DownloadRecord; development: boolean }
  | { ticket: TeamFileDownload }
  | { error: string }
  | { abort: true }
  | { release: true };
const ctx = globalThis as unknown as {
  postMessage(value: unknown): void;
  onmessage: ((e: { data: Inbound }) => void) | null;
};
const controller = new AbortController();
let ticketResolve: ((t: TeamFileDownload) => void) | undefined,
  ticketReject: ((e: Error) => void) | undefined,
  release: (() => void) | undefined,
  running = false;
ctx.onmessage = async ({ data }) => {
  if ("abort" in data) {
    controller.abort();
    ticketReject?.(new Error("B2B_FILE_DOWNLOAD_INTERRUPTED"));
    release?.();
    return;
  }
  if ("ticket" in data) {
    ticketResolve?.(data.ticket);
    return;
  }
  if ("error" in data) {
    ticketReject?.(new Error(data.error));
    return;
  }
  if ("release" in data) {
    release?.();
    return;
  }
  if (running) return;
  running = true;
  let access: SyncFile | undefined;
  try {
    const directory = await downloadDirectory(),
      handle = await directory.getFileHandle(downloadName(data.record), {
        create: true,
      });
    if (
      typeof (handle as unknown as { createSyncAccessHandle?: unknown })
        .createSyncAccessHandle !== "function"
    )
      throw new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE");
    access = await (
      handle as unknown as { createSyncAccessHandle(): Promise<SyncFile> }
    ).createSyncAccessHandle();
    const file = access;
    const stage: DownloadStage = {
      size: () => file.getSize(),
      read: (at, length) => {
        const bytes = new Uint8Array(length);
        let count = 0;
        while (count < length) {
          const received = file.read(bytes.subarray(count), { at: at + count });
          if (!received) break;
          count += received;
        }
        return bytes.subarray(0, count);
      },
      write: (at, bytes) => {
        let done = 0;
        while (done < bytes.length) {
          const written = file.write(bytes.subarray(done), { at: at + done });
          if (!written)
            throw new Error("B2B_FILE_DOWNLOAD_STORAGE_UNAVAILABLE");
          done += written;
        }
      },
      truncate: (size) => file.truncate(size),
      flush: () => file.flush(),
    };
    await receiveVerifiedFile({
      identity: data.record,
      stage,
      signal: controller.signal,
      development: data.development,
      progress: (phase, bytes) => ctx.postMessage({ phase, bytes }),
      ticket: () =>
        new Promise((resolve, reject) => {
          ticketResolve = resolve;
          ticketReject = reject;
          ctx.postMessage({ ticketNeeded: true });
        }),
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    ctx.postMessage({ verified: true });
    await released;
    controller.signal.throwIfAborted();
    file.close();
    access = undefined;
    const snapshot = await handle.getFile();
    if (snapshot.size !== data.record.size)
      throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
    ctx.postMessage({ file: snapshot });
  } catch (e) {
    ctx.postMessage({
      error:
        e instanceof Error && /^B2B_FILE_/.test(e.message)
          ? e.message
          : (e as { name?: string })?.name === "QuotaExceededError"
            ? "B2B_FILE_DOWNLOAD_STORAGE_FULL"
            : (e as { name?: string })?.name === "NoModificationAllowedError"
              ? "B2B_FILE_DOWNLOAD_BUSY"
              : "B2B_FILE_DOWNLOAD_INTERRUPTED",
    });
  } finally {
    try {
      access?.flush();
    } finally {
      access?.close();
    }
  }
};
