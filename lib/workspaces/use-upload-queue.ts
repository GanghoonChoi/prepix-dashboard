"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cloudService, type Asset } from "../api/services/cloud.service";
import { cloudErrorCode } from "@/components/workspaces/cloud-shared";
import { uploadFile } from "./upload";
import {
  fileRejection,
  isSettled,
  nextQueued,
  patch,
  queueSummary,
  type Transfer,
} from "./queue";

/**
 * The upload machine, lifted out of the archive page.
 *
 * It was one state and nine refs inline in a 1,090-line component, which is
 * why adding anything to that page meant reading all of it first. Nothing here
 * changed behaviour — the pump, the per-row abort, the digest reuse and the
 * resume path are the same code in a smaller room.
 *
 * The page keeps what is genuinely its own: the file input, the confirmation
 * dialog and the copy inside it. This owns only the transfers.
 */
export type UploadQueue = {
  transfers: Transfer[];
  summary: ReturnType<typeof queueSummary>;
  /** Something is running or waiting — used to guard navigation and folders. */
  busy: boolean;
  /** `folderId` overrides the open folder (a dropped folder, a folder card). */
  enqueue: (files: File[], options?: { resuming?: Asset; folderId?: string }) => void;
  pause: (entry: Transfer) => void;
  resume: (entry: Transfer) => void;
  /**
   * Whether cancelling this row would destroy bytes the server already holds.
   * A queued row that never reached the server has no consequence to confirm —
   * that is an absent one, not a skipped gate.
   */
  needsConfirm: (entry: Transfer) => boolean;
  discard: (entry: Transfer) => Promise<void>;
  clearSettled: () => void;
  /** Stop everything, for when the archive itself is gone. */
  abortAll: () => void;
};

/** Files in flight at once. Each still sends its parts one by one. */
const PARALLEL = 3;

export function useUploadQueue({
  workspaceId,
  folderId,
  canEdit,
  uploadsEnabled,
  maxFileBytes,
  reload,
  onEnqueue,
}: {
  workspaceId: string;
  folderId?: string;
  canEdit: boolean;
  uploadsEnabled: boolean;
  maxFileBytes: number;
  reload: () => Promise<void>;
  /** Fired when rows are added, so the page can clear a stale notice. */
  onEnqueue?: () => void;
}): UploadQueue {
  // One row per file (F04.3). Everything that cannot live in state — the File
  // handle, the abort, the digest we already paid for — is keyed by the row id.
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const queue = useRef<Transfer[]>([]);
  const handles = useRef(new Map<string, File>());
  const controllers = useRef(new Map<string, AbortController>());
  const digests = useRef(new Map<string, string>());
  const resumeAssets = useRef(new Map<string, Asset>());
  const destinations = useRef(new Map<string, string | undefined>());
  const cancelled = useRef(new Set<string>());
  const workers = useRef(0);
  const alive = useRef(true);
  // The running loop calls whatever `reload` is current, not the one bound to
  // the folder that was open when it started.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  const commit = useCallback((next: Transfer[]) => {
    queue.current = next;
    setTransfers(next);
  }, []);
  const update = useCallback(
    (entryId: string, changes: Partial<Transfer>) => {
      if (alive.current) commit(patch(queue.current, entryId, changes));
    },
    [commit],
  );

  const abortAll = useCallback(() => {
    // Waiting rows pause too, or the loop would start them next.
    commit(
      queue.current.map((entry) =>
        entry.state === "queued" ? { ...entry, state: "paused" } : entry,
      ),
    );
    for (const abort of controllers.current.values()) abort.abort();
  }, [commit]);

  useEffect(() => {
    alive.current = true;
    const running = controllers.current;
    return () => {
      alive.current = false;
      for (const abort of running.values()) abort.abort();
    };
  }, []);

  /**
   * Work the queue PARALLEL files at a time, and never let one file end it.
   *
   * The loop this replaces shared a single AbortController and a single catch:
   * a throw on file 3 skipped files 4..N entirely and left them with no status,
   * and "pause" aborted the whole batch and told the user to re-pick the rest
   * by hand. Each row now owns its abort and its verdict, and a failure is a
   * `continue`. A row is claimed (state leaves "queued") before the first
   * await, so two workers never take the same file.
   */
  const work = useCallback(async () => {
    try {
      for (;;) {
        // Unmounted: the page that showed this queue is gone, so nothing new
        // starts where nobody can see it or stop it.
        if (!alive.current) break;
        const entry = nextQueued(queue.current);
        if (!entry) break;
        const file = handles.current.get(entry.id);
        if (!file) {
          update(entry.id, {
            state: "failed",
            error: "UPLOAD_RESUME_MISMATCH",
          });
          continue;
        }
        const abort = new AbortController();
        controllers.current.set(entry.id, abort);
        update(entry.id, { state: "hashing", error: undefined });
        try {
          await uploadFile({
            file,
            workspaceId,
            folderId: destinations.current.get(entry.id),
            resume: resumeAssets.current.get(entry.id),
            // Reuse the digest we already computed for this exact File object,
            // so pausing a 50 GB original does not re-hash it on resume.
            digest: digests.current.get(entry.id),
            signal: abort.signal,
            onDigest: (digest) => digests.current.set(entry.id, digest),
            onProgress: (phase, moved) =>
              update(
                entry.id,
                phase === "hashing"
                  ? { state: "hashing", hashed: moved }
                  : phase === "verifying"
                    ? { state: "verifying", sent: moved }
                    : { state: "uploading", sent: moved },
              ),
            onCreated: (asset) => {
              resumeAssets.current.set(entry.id, asset);
              update(entry.id, { assetId: asset.id });
              // Cancelled while the server was creating it: tell the server,
              // or the half-made upload keeps its storage reservation.
              if (cancelled.current.has(entry.id))
                void cloudService.cancel(workspaceId, asset.id).catch(() => {});
              void reloadRef.current();
            },
          });
          update(entry.id, { state: "done", sent: entry.total });
        } catch (e) {
          update(
            entry.id,
            cancelled.current.has(entry.id)
              ? { state: "cancelled" }
              : abort.signal.aborted
                ? { state: "paused" }
                : { state: "failed", error: cloudErrorCode(e) },
          );
        } finally {
          controllers.current.delete(entry.id);
        }
        if (alive.current) await reloadRef.current();
      }
    } finally {
      workers.current--;
    }
  }, [workspaceId, update]);

  const pump = useCallback(() => {
    while (workers.current < PARALLEL && alive.current && nextQueued(queue.current)) {
      workers.current++;
      void work();
    }
  }, [work]);

  /**
   * A rejected file is marked in the queue, not a verdict on the selection.
   * Dropping 40 clips with one 0-byte sidecar uploads the other 39 and names
   * the one that was refused.
   */
  const enqueue = useCallback(
    (selected: File[], options: { resuming?: Asset; folderId?: string } = {}) => {
      if (!canEdit || !uploadsEnabled || !selected.length) return;
      const { resuming } = options;
      const destination = "folderId" in options ? options.folderId : folderId;
      const added: Transfer[] = selected.map((file) => {
        const entryId = crypto.randomUUID();
        handles.current.set(entryId, file);
        destinations.current.set(entryId, destination);
        if (resuming) resumeAssets.current.set(entryId, resuming);
        const rejected = fileRejection(file, maxFileBytes);
        return {
          id: entryId,
          name: file.name,
          total: file.size,
          hashed: 0,
          sent: 0,
          state: rejected ? "invalid" : "queued",
          error: rejected,
        };
      });
      onEnqueue?.();
      commit([...queue.current, ...added]);
      void pump();
    },
    [canEdit, uploadsEnabled, maxFileBytes, folderId, onEnqueue, commit, pump],
  );

  const pause = useCallback((entry: Transfer) => {
    controllers.current.get(entry.id)?.abort();
  }, []);

  const resume = useCallback(
    (entry: Transfer) => {
      cancelled.current.delete(entry.id);
      update(entry.id, { state: "queued", error: undefined });
      void pump();
    },
    [update, pump],
  );

  const discard = useCallback(
    async (entry: Transfer) => {
      cancelled.current.add(entry.id);
      controllers.current.get(entry.id)?.abort();
      update(entry.id, { state: "cancelled" });
      if (!entry.assetId) return;
      // Completed files stay; only the file in flight is cancelled (F04.3).
      try {
        await cloudService.cancel(workspaceId, entry.assetId);
      } catch {
        /* the asset row keeps its own cancel button for a retry */
      }
      await reloadRef.current();
    },
    [workspaceId, update],
  );

  const clearSettled = useCallback(() => {
    const [gone, kept] = [
      queue.current.filter((entry) => isSettled(entry.state)),
      queue.current.filter((entry) => !isSettled(entry.state)),
    ];
    // Their File handles go with them; a cleared row is never resumed.
    for (const entry of gone)
      for (const map of [handles, controllers, digests, resumeAssets, destinations])
        map.current.delete(entry.id);
    commit(kept);
  }, [commit]);

  const summary = queueSummary(transfers);
  const busy = summary.running + summary.waiting > 0;

  useEffect(() => {
    if (!busy) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [busy]);

  return {
    transfers,
    summary,
    busy,
    enqueue,
    pause,
    resume,
    needsConfirm: (entry: Transfer) => !!entry.assetId,
    discard,
    clearSettled,
    abortAll,
  };
}
