import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { cloudService, type Asset } from "../api/services/cloud.service";

export async function fileDigest(
  file: Blob,
  signal: AbortSignal,
  progress: (bytes: number) => void = () => {},
) {
  const hash = sha256.create();
  const chunkSize = 4 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    signal.throwIfAborted();
    hash.update(
      new Uint8Array(
        await file.slice(offset, offset + chunkSize).arrayBuffer(),
      ),
    );
    progress(Math.min(file.size, offset + chunkSize));
    // Yield between bounded chunks so pause and navigation remain responsive.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  signal.throwIfAborted();
  return bytesToHex(hash.digest());
}
/**
 * The same digest, off the main thread when the platform has a worker.
 *
 * Falls back to the in-thread version when there is no `Worker` (node tests,
 * SSR) or when the bundler could not produce one — a hash that blocks the tab
 * is still better than an upload that cannot start.
 */
export function fileDigestOffThread(
  file: Blob,
  signal: AbortSignal,
  progress: (bytes: number) => void = () => {},
): Promise<string> {
  if (typeof Worker === "undefined") return fileDigest(file, signal, progress);
  let worker: Worker;
  try {
    worker = new Worker(new URL("./digest.worker.ts", import.meta.url));
  } catch {
    return fileDigest(file, signal, progress);
  }
  return new Promise<string>((resolve, reject) => {
    const stop = () => {
      worker.terminate();
      signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException("Paused", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as {
        progress?: number;
        digest?: string;
        error?: string;
      };
      if (typeof data.progress === "number") progress(data.progress);
      else if (data.digest) {
        stop();
        resolve(data.digest);
      } else {
        stop();
        reject(new Error(data.error || "UPLOAD_TRANSFER_FAILED"));
      }
    };
    worker.onerror = () => {
      stop();
      reject(new Error("UPLOAD_TRANSFER_FAILED"));
    };
    worker.postMessage({ blob: file });
  });
}
export function resumeMatches(
  file: { name: string; size: number },
  digest: string,
  asset: Asset,
) {
  return file.size === asset.size && digest === asset.sha256;
}
export function bytes(value: number) {
  if (value < 1000) return `${value} B`;
  const i = Math.min(3, Math.floor(Math.log10(value) / 3));
  return `${(value / 1000 ** i).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${["B", "KB", "MB", "GB"][i]}`;
}
const put = (
  url: string,
  headers: Record<string, string>,
  body: Blob,
  signal: AbortSignal,
  progress: (n: number) => void,
) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.timeout = 10 * 60_000;
    for (const [key, value] of Object.entries(headers))
      request.setRequestHeader(key, value);
    const abort = () => request.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    signal.addEventListener("abort", abort, { once: true });
    request.upload.onprogress = (event) => progress(event.loaded);
    request.onload = () =>
      finish(
        request.status >= 200 && request.status < 300
          ? undefined
          : new Error("UPLOAD_TRANSFER_FAILED"),
      );
    request.onerror = () => finish(new Error("UPLOAD_TRANSFER_FAILED"));
    request.ontimeout = () => finish(new Error("UPLOAD_TRANSFER_FAILED"));
    request.onabort = () => finish(new DOMException("Paused", "AbortError"));
    request.send(body);
  });
export async function uploadFile(input: {
  file: File;
  workspaceId: string;
  projectId: string;
  folderId?: string;
  resume?: Asset;
  /**
   * A digest already computed for this exact File object in this session, so a
   * pause/resume does not re-hash 50 GB. Never reuse one across a re-selection
   * from disk — F04.4 wants the re-picked file checked, not assumed.
   */
  digest?: string;
  signal: AbortSignal;
  onProgress: (
    phase: "hashing" | "uploading" | "verifying",
    bytes: number,
  ) => void;
  onCreated: (asset: Asset) => void;
  onDigest?: (digest: string) => void;
}) {
  const { file, workspaceId: w, projectId: p, signal, onProgress } = input;
  const digest =
    input.digest ??
    (await fileDigestOffThread(file, signal, (n) => onProgress("hashing", n)));
  input.onDigest?.(digest);
  if (input.resume && !resumeMatches(file, digest, input.resume))
    throw new Error("UPLOAD_RESUME_MISMATCH");
  const id = input.resume?.id ?? crypto.randomUUID();
  const body = {
    id,
    name: input.resume?.name ?? file.name,
    size: file.size,
    sha256: digest,
    folderId: input.resume?.folderId ?? input.folderId,
  };
  // Same operation ID across uncertain create responses. On a later visit,
  // server-side pending uploads are the source of truth; no token/URL persists.
  let result: Awaited<ReturnType<typeof cloudService.begin>>;
  try {
    result = await cloudService.begin(w, p, body);
  } catch (error) {
    if ((error as { response?: unknown }).response || signal.aborted)
      throw error;
    result = await cloudService.begin(w, p, body);
  }
  input.onCreated(result.asset);
  signal.throwIfAborted();
  if (result.asset.state !== "uploading") return result.asset;
  const status = await cloudService.upload(w, p, id);
  if (status.needsCompletion) {
    signal.throwIfAborted();
    onProgress("verifying", file.size);
    return cloudService.complete(w, p, id);
  }
  // The part size drives the loop counter, so a server that answers 0 — or
  // something small enough to demand millions of parts — hangs the tab rather
  // than failing. Trust it only after it can actually finish.
  if (
    !Number.isInteger(status.partSize) ||
    status.partSize <= 0 ||
    file.size / status.partSize > 10_000
  )
    throw new Error("UPLOAD_PART_SIZE_INVALID");
  const completed = new Map(
    status.parts.map((part) => [part.number, part.size]),
  );
  let sent = [...completed.values()].reduce((sum, size) => sum + size, 0);
  for (
    let offset = 0, number = 1;
    offset < file.size;
    offset += status.partSize, number++
  ) {
    signal.throwIfAborted();
    const chunk = file.slice(offset, offset + status.partSize);
    if (completed.get(number) === chunk.size) continue;
    const digest = sha256(new Uint8Array(await chunk.arrayBuffer()));
    const checksum = btoa(String.fromCharCode(...digest));
    const part = await cloudService.part(w, p, id, number, checksum);
    await put(part.url, part.headers, chunk, signal, (n) =>
      onProgress("uploading", Math.min(file.size, sent + n)),
    );
    sent += chunk.size;
  }
  signal.throwIfAborted();
  onProgress("verifying", file.size);
  return cloudService.complete(w, p, id);
}
