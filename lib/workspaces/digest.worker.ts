/**
 * Full-file SHA-256, off the main thread.
 *
 * F04.4 needs the digest before a byte moves and again on every resume, and a
 * 50 GB original is minutes of work. Run on the main thread it freezes the tab
 * — `setTimeout(0)` between 4 MiB chunks keeps the page technically responsive
 * but still burns the whole budget there. A Blob is structured-cloneable, so
 * the file is handed over and sliced here instead.
 *
 * `globalThis` is cast rather than typed as DedicatedWorkerGlobalScope: the
 * project compiles with lib.dom, where `postMessage` wants a target origin.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

type Outbound =
  | { progress: number }
  | { digest: string }
  | { error: string };

const ctx = globalThis as unknown as {
  postMessage(message: Outbound): void;
  onmessage: ((event: { data: { blob: Blob } }) => void) | null;
};

ctx.onmessage = async (event) => {
  const blob = event.data.blob;
  const chunkSize = 4 * 1024 * 1024;
  try {
    const hash = sha256.create();
    for (let offset = 0; offset < blob.size; offset += chunkSize) {
      hash.update(
        new Uint8Array(
          await blob.slice(offset, offset + chunkSize).arrayBuffer(),
        ),
      );
      ctx.postMessage({ progress: Math.min(blob.size, offset + chunkSize) });
    }
    ctx.postMessage({ digest: bytesToHex(hash.digest()) });
  } catch (error) {
    ctx.postMessage({ error: (error as Error).message || "DIGEST_FAILED" });
  }
};
