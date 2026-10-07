import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { TeamFileDownload } from "../api/generated/b2b";
export type DownloadIdentity = { size: number; sha256: string };
export interface DownloadStage {
  size(): number;
  read(at: number, length: number): Uint8Array;
  write(at: number, bytes: Uint8Array): void;
  flush(): void;
  truncate(size: number): void;
}
export const DOWNLOAD_BLOCK = 8 * 1024 * 1024;
export function downloadUrl(
  ticket: TeamFileDownload,
  expected: DownloadIdentity,
  development: boolean,
) {
  const url = new URL(ticket.url);
  if (
    !Number.isInteger(ticket.expiresIn) ||
    ticket.expiresIn < 1 ||
    ticket.expiresIn > 60 ||
    ticket.size !== expected.size ||
    ticket.sha256 !== expected.sha256 ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(
        development &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        url.protocol === "http:"
      ))
  )
    throw new Error("B2B_FILE_DOWNLOAD_INVALID");
  return url.href;
}
export async function receiveVerifiedFile(options: {
  identity: DownloadIdentity;
  stage: DownloadStage;
  ticket: () => Promise<TeamFileDownload>;
  signal: AbortSignal;
  development: boolean;
  fetcher?: typeof fetch;
  progress: (phase: "checking" | "receiving", bytes: number) => void;
}) {
  const { identity, stage, signal, progress } = options;
  if (
    !Number.isSafeInteger(identity.size) ||
    identity.size < 1 ||
    !/^[a-f0-9]{64}$/.test(identity.sha256)
  )
    throw new Error("B2B_FILE_DOWNLOAD_INVALID");
  let offset = stage.size();
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > identity.size)
    throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
  const hash = sha256.create();
  progress("checking", 0);
  for (let at = 0; at < offset; at += 4 * 1024 * 1024) {
    signal.throwIfAborted();
    const length = Math.min(4 * 1024 * 1024, offset - at),
      bytes = stage.read(at, length);
    if (bytes.byteLength !== length)
      throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
    hash.update(bytes);
    progress("checking", at + length);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  progress("receiving", offset);
  while (offset < identity.size) {
    signal.throwIfAborted();
    const ticket = await options.ticket();
    signal.throwIfAborted();
    const end = Math.min(offset + DOWNLOAD_BLOCK, identity.size) - 1;
    const response = await (options.fetcher ?? fetch)(
      downloadUrl(ticket, identity, options.development),
      {
        headers: { Range: `bytes=${offset}-${end}` },
        signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      },
    );
    const encoding = response.headers.get("content-encoding");
    if (
      response.status !== 206 ||
      !response.body ||
      response.headers.get("content-range") !==
        `bytes ${offset}-${end}/${identity.size}` ||
      response.headers.get("content-length") !== String(end - offset + 1) ||
      (encoding && encoding !== "identity")
    ) {
      await response.body?.cancel();
      throw new Error("B2B_FILE_DOWNLOAD_RANGE_INVALID");
    }
    const reader = response.body.getReader();
    let received = offset;
    let flushed = offset;
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.byteLength > end + 1)
          throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
        stage.write(received, value);
        hash.update(value);
        received += value.byteLength;
        if (received - flushed >= 4 * 1024 * 1024 || received === end + 1) {
          stage.flush();
          flushed = received;
        }
        progress("receiving", received);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (received !== end + 1) throw new Error("B2B_FILE_DOWNLOAD_INTERRUPTED");
    offset = received;
  }
  signal.throwIfAborted();
  stage.flush();
  if (
    stage.size() !== identity.size ||
    bytesToHex(hash.digest()) !== identity.sha256
  ) {
    stage.truncate(0);
    stage.flush();
    progress("receiving", 0);
    throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
  }
}
