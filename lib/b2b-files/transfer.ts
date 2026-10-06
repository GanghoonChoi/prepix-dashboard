import { sha256 } from "@noble/hashes/sha2.js";
import type {
  TeamFileUpload,
  TeamFileUploadStatus,
  TeamFileKind,
} from "../api/generated/b2b";
import { fileDigestOffThread, putPart } from "../workspaces/upload";
import type { FileApi, FileScope } from "./api";
import type { TransferRecord, TransferStore } from "./store";

export type TransferPhase = "hashing" | "uploading" | "verifying";
type Progress = (phase: TransferPhase, bytes: number) => void;
const digests = new WeakMap<Blob, string>();
async function digest(file: Blob, signal: AbortSignal, progress: Progress) {
  signal.throwIfAborted();
  const value =
    digests.get(file) ??
    (await fileDigestOffThread(file, signal, (n) => progress("hashing", n)));
  signal.throwIfAborted();
  digests.set(file, value);
  return value;
}
export async function prepareTransfer(options: {
  file: File;
  scope: FileScope;
  kind: TeamFileKind;
  existingAssetId?: string;
  maxFileBytes: number;
  store: TransferStore;
  signal: AbortSignal;
  progress: Progress;
}) {
  const { file, signal, progress } = options;
  const name = file.name.trim().normalize("NFC");
  if (
    !name ||
    name.length > 255 ||
    /[\\/\u0000-\u001f\u007f]/.test(name) ||
    name === "." ||
    name === ".."
  )
    throw new Error("B2B_FILE_NAME_INVALID");
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > options.maxFileBytes
  )
    throw new Error("B2B_FILE_SIZE_INVALID");
  const record: TransferRecord = {
    schema: 1,
    scope: options.scope,
    input: {
      requestKey: crypto.randomUUID(),
      name,
      size: file.size,
      sha256: await digest(file, signal, progress),
      kind: options.kind,
      scope: "uploader_and_steward",
      ...(options.existingAssetId
        ? { existingAssetId: options.existingAssetId }
        : {}),
    },
    cancelRequested: false,
  };
  signal.throwIfAborted();
  return options.store.save(record);
}
export function matchesUpload(record: TransferRecord, upload: TeamFileUpload) {
  return (
    upload.workspaceId === record.scope.workspaceId &&
    upload.projectId === record.scope.projectId &&
    (!record.uploadId || record.uploadId === upload.id) &&
    upload.name === record.input.name &&
    upload.size === record.input.size &&
    upload.sha256 === record.input.sha256 &&
    upload.kind === record.input.kind &&
    (!record.input.existingAssetId ||
      upload.assetId === record.input.existingAssetId)
  );
}
export function checkParts(status: TeamFileUploadStatus) {
  const { upload, parts } = status;
  if (
    !Number.isSafeInteger(upload.partSize) ||
    upload.partSize < 1 ||
    Math.ceil(upload.size / upload.partSize) > 10000
  )
    throw new Error("UPLOAD_PART_SIZE_INVALID");
  const seen = new Set<number>();
  for (const part of parts) {
    const expected = Math.min(
      upload.partSize,
      upload.size - (part.number - 1) * upload.partSize,
    );
    if (
      !Number.isInteger(part.number) ||
      part.number < 1 ||
      part.number > Math.ceil(upload.size / upload.partSize) ||
      seen.has(part.number) ||
      part.size !== expected ||
      (part.checksum !== undefined &&
        !/^[A-Za-z0-9+/]{43}=$/.test(part.checksum))
    )
      throw new Error("B2B_FILE_PARTS_INVALID");
    seen.add(part.number);
  }
}
export async function resumeTransfer(options: {
  record: TransferRecord;
  file?: File;
  api: FileApi;
  store: TransferStore;
  signal: AbortSignal;
  progress: Progress;
  saved?: (record: TransferRecord) => void;
  put?: typeof putPart;
}) {
  const { api, signal, progress, store } = options;
  let record = await store.save(options.record);
  signal.throwIfAborted();
  if (record.cancelRequested) throw new Error("B2B_FILE_CANCEL_PENDING");
  const lookup = await api.lookup(record.input.requestKey, signal);
  signal.throwIfAborted();
  if (lookup.currentUserId !== record.scope.userId)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  if (lookup.cancelled) throw new Error("B2B_FILE_BEGIN_CANCELLED");
  let upload = lookup.upload;
  if (upload && !matchesUpload(record, upload))
    throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
  if (upload) {
    record = await store.save({ ...record, uploadId: upload.id });
    options.saved?.(record);
    signal.throwIfAborted();
    if (record.cancelRequested) throw new Error("B2B_FILE_CANCEL_PENDING");
    if (!["preparing", "uploading"].includes(upload.state)) return upload;
  }
  // Every re-picked File has to prove its content, even when its name matches.
  if (
    options.file &&
    (options.file.size !== record.input.size ||
      (await digest(options.file, signal, progress)) !== record.input.sha256)
  )
    throw new Error("UPLOAD_RESUME_MISMATCH");
  let status: TeamFileUploadStatus;
  if (!upload || upload.state === "preparing") {
    if (!options.file) throw new Error("B2B_FILE_RESELECT_REQUIRED");
    signal.throwIfAborted();
    status = await api.begin(record.input, signal);
  } else status = await api.status(upload.id, signal);
  signal.throwIfAborted();
  upload = status.upload;
  if (!matchesUpload(record, upload))
    throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
  record = await store.save({ ...record, uploadId: upload.id });
  options.saved?.(record);
  signal.throwIfAborted();
  if (record.cancelRequested) throw new Error("B2B_FILE_CANCEL_PENDING");
  if (upload.state !== "uploading") return upload;
  if (!status.needsCompletion) {
    if (!options.file) throw new Error("B2B_FILE_RESELECT_REQUIRED");
    checkParts(status);
    const parts = new Map(status.parts.map((p) => [p.number, p]));
    let sent = 0;
    for (
      let offset = 0, number = 1;
      offset < upload.size;
      offset += upload.partSize, number++
    ) {
      signal.throwIfAborted();
      const chunk = options.file.slice(offset, offset + upload.partSize);
      const checksum = btoa(
        String.fromCharCode(
          ...sha256(new Uint8Array(await chunk.arrayBuffer())),
        ),
      );
      signal.throwIfAborted();
      const existing = parts.get(number);
      if (existing?.checksum && existing.checksum !== checksum)
        throw new Error("UPLOAD_RESUME_MISMATCH");
      if (!existing) {
        const part = await api.part(upload.id, number, checksum, signal);
        signal.throwIfAborted();
        await (options.put ?? putPart)(
          part.url,
          part.headers,
          chunk,
          signal,
          (n) => progress("uploading", Math.min(upload.size, sent + n)),
        );
      }
      sent += chunk.size;
      progress("uploading", sent);
    }
  }
  signal.throwIfAborted();
  progress("verifying", upload.size);
  const completed = (await api.complete(upload.id, signal)).upload;
  if (!matchesUpload(record, completed))
    throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
  return completed;
}
export async function cancelTransfer(
  record: TransferRecord,
  api: FileApi,
  store: TransferStore,
  signal: AbortSignal,
) {
  const saved = await store.save({ ...record, cancelRequested: true });
  signal.throwIfAborted();
  const receipt = await api.cancel(saved.input.requestKey, signal);
  signal.throwIfAborted();
  // Server cancellation fences an unknown/late begin; it is distinct from
  // actual temporary-object cleanup and release of reserved quota.
  if (
    !receipt.cancelled ||
    (saved.uploadId && receipt.uploadId !== saved.uploadId)
  )
    throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
  return receipt;
}
