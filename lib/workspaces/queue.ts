/**
 * The transfer panel's state, one row per file.
 *
 * Spec F04.3 asks for 파일명, 완료 bytes/전체 bytes, 진행률, 상태 and
 * 일시 중지·재개·취소 *per file*. That is only possible if each file carries its
 * own state, its own error code and its own abort — a single shared progress
 * object plus a single AbortController collapses forty files into one row, one
 * verdict and one pause button.
 *
 * Hashing and transferring are separate phases with separate byte counts
 * (`hashed` and `sent`) so that finishing the hash does not slam a 100% bar
 * back to 0% when the bytes start moving.
 */
export type TransferState =
  | "queued"
  | "hashing"
  | "uploading"
  | "verifying"
  | "done"
  | "paused"
  | "failed"
  | "invalid"
  | "cancelled";

export type Transfer = {
  id: string;
  name: string;
  total: number;
  hashed: number;
  sent: number;
  state: TransferState;
  /** Error code for `invalid` and `failed`; rendered per row, never aggregated. */
  error?: string;
  /** Server-side asset id once the upload has been registered. */
  assetId?: string;
};

const ACTIVE: TransferState[] = ["hashing", "uploading", "verifying"];
const SETTLED: TransferState[] = ["done", "cancelled", "invalid"];

/**
 * Rejected files are marked in the queue instead of cancelling the selection.
 * Dropping 40 clips with one 0-byte sidecar uploads 39 and names the one that
 * was refused.
 */
export function fileRejection(
  file: { size: number },
  maxFileBytes: number,
): string | undefined {
  return file.size === 0 || file.size > maxFileBytes
    ? "UPLOAD_FILE_INVALID"
    : undefined;
}

export function isActive(state: TransferState) {
  return ACTIVE.includes(state);
}

export function isSettled(state: TransferState) {
  return SETTLED.includes(state);
}

export function canPause(state: TransferState) {
  return isActive(state);
}

export function canResume(state: TransferState) {
  return state === "paused" || state === "failed";
}

export function canCancel(state: TransferState) {
  return !isSettled(state);
}

/** The next file to work on. A failed or paused row never blocks the queue. */
export function nextQueued(transfers: Transfer[]) {
  return transfers.find((transfer) => transfer.state === "queued");
}

export function patch(
  transfers: Transfer[],
  id: string,
  changes: Partial<Transfer>,
): Transfer[] {
  return transfers.map((transfer) =>
    transfer.id === id ? { ...transfer, ...changes } : transfer,
  );
}

/** Header counts for the panel. Failures stay visible; they are not a total. */
export function queueSummary(transfers: Transfer[]) {
  return {
    total: transfers.length,
    done: transfers.filter((t) => t.state === "done").length,
    failed: transfers.filter((t) => t.state === "failed" || t.state === "invalid")
      .length,
    running: transfers.filter((t) => isActive(t.state)).length,
    waiting: transfers.filter((t) => t.state === "queued").length,
  };
}

/** Bytes the row has actually moved, for its own progress bar. */
/**
 * One transfer, one bar.
 *
 * `uploadFile` reads the file twice — the whole thing is hashed before a byte
 * is sent, because the server needs the digest to create the asset row — so
 * feeding one bar from `hashed` and then from `sent` ran it 0→100, reset it,
 * and ran it 0→100 again. That reads as the file being uploaded twice, which
 * is what it was reported as.
 *
 * So `value`/`max` span BOTH passes and only ever move forward. `moved` is the
 * bytes of the current pass, for the counter under the bar: "25 MB / 100 MB"
 * while sending, never "125 MB / 100 MB".
 */
export function transferProgress(transfer: Transfer) {
  const max = transfer.total * 2;
  // Nothing has been read yet, and for `invalid` nothing ever will be.
  if (transfer.state === "queued" || transfer.state === "invalid")
    return { value: 0, max, moved: 0 };
  if (transfer.state === "hashing")
    return { value: transfer.hashed, max, moved: transfer.hashed };
  // Past the hash by definition — and a resume reuses the digest it already
  // has, so `hashed` may never fill again in this pass. Count the read as
  // done, or such a transfer could never reach 100%.
  if (
    transfer.state === "uploading" ||
    transfer.state === "verifying" ||
    transfer.state === "done"
  ) {
    const sent = transfer.state === "done" ? transfer.total : transfer.sent;
    return { value: transfer.total + sent, max, moved: sent };
  }
  // Stopped somewhere: paused, failed or cancelled. Report how far it actually
  // got rather than assuming it finished reading — a transfer that died ten
  // bytes into the hash is not half done.
  return {
    value: transfer.hashed + transfer.sent,
    max,
    moved: transfer.sent || transfer.hashed,
  };
}
