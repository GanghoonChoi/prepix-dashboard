"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamFileVersion } from "../api/generated/b2b";
import { fileApi, fileError, type FileScope } from "./api";
import { downloadUrl } from "./download-engine";
import { BrowserDownloadStore, type DownloadRecord } from "./download-store";
import {
  discardReceipt,
  receiveInBrowser,
  type DownloadProgress,
} from "./download";
export type FileDownloadJob = {
  record: DownloadRecord;
  version?: TeamFileVersion;
  state: "paused" | "checking" | "receiving" | "authorizing" | "saved";
  bytes: number;
  error?: string;
};
export function useFileDownloads(
  scope: FileScope,
  active: boolean,
  invalidate: () => void,
) {
  const api = useMemo(() => fileApi(scope), [scope]),
    store = useMemo(() => new BrowserDownloadStore(), []);
  const [jobs, setJobs] = useState<FileDownloadJob[]>([]),
    [error, setError] = useState("");
  const controllers = useRef(new Map<string, AbortController>()),
    enabled = useRef(active),
    generation = useRef(0),
    readSerial = useRef(0),
    objects = useRef(new Map<string, string>());
  enabled.current = active;
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const serial = ++readSerial.current;
      const records = await store.list(scope);
      signal.throwIfAborted();
      const current: FileDownloadJob[] = [];
      for (const record of records) {
        if (serial !== readSerial.current) return;
        try {
          const { version } = await api.version(record.versionId, signal);
          signal.throwIfAborted();
          if (!version.allowedActions.download)
            throw new Error("B2B_FILE_DOWNLOAD_DENIED");
          if (
            version.id !== record.versionId ||
            version.size !== record.size ||
            version.sha256 !== record.sha256
          )
            throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
          current.push({ record, version, state: "paused", bytes: 0 });
        } catch (e) {
          signal.throwIfAborted();
          if (enabled.current && serial === readSerial.current) {
            controllers.current.get(record.versionId)?.abort();
            const url = objects.current.get(record.versionId);
            if (url) URL.revokeObjectURL(url);
            objects.current.delete(record.versionId);
            setJobs((rows) =>
              rows.map((j) =>
                j.record.versionId === record.versionId
                  ? { record, state: "paused", bytes: 0, error: fileError(e) }
                  : j,
              ),
            );
          }
          current.push({
            record,
            state: "paused",
            bytes: 0,
            error: fileError(e),
          });
        }
      }
      if (enabled.current && !signal.aborted && serial === readSerial.current) {
        setJobs((prior) => [
          ...prior.filter(
            (j) =>
              controllers.current.has(j.record.versionId) &&
              !current.some((n) => n.record.versionId === j.record.versionId),
          ),
          ...current.map((j) => {
            const old = prior.find(
              (p) => p.record.versionId === j.record.versionId,
            );
            return j.version && old
              ? { ...j, state: old.state, bytes: old.bytes, error: old.error }
              : j;
          }),
        ]);
        setError("");
      }
    },
    [store, scope, api],
  );
  useEffect(() => {
    const running = controllers.current,
      urls = objects.current;
    let reader: AbortController | undefined;
    const read = () => {
      if (!enabled.current || document.visibilityState !== "visible") return;
      reader?.abort();
      const abort = new AbortController();
      reader = abort;
      void refresh(abort.signal).catch((e) => {
        if (!abort.signal.aborted && enabled.current) {
          setJobs((rows) =>
            rows.filter((j) => controllers.current.has(j.record.versionId)),
          );
          setError(fileError(e));
        }
      });
    };
    const start = window.setTimeout(read, 0),
      interval = window.setInterval(read, 15000);
    window.addEventListener("focus", read);
    const sequence = generation;
    return () => {
      ++sequence.current;
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", read);
      reader?.abort();
      for (const controller of running.values()) controller.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, [active, refresh]);
  const start = useCallback(
    async (version: TeamFileVersion) => {
      if (!enabled.current || controllers.current.has(version.id)) return;
      const controller = new AbortController(),
        sequence = generation.current;
      controllers.current.set(version.id, controller);
      setError("");
      const record: DownloadRecord = {
        schema: 1,
        scope,
        versionId: version.id,
        size: version.size,
        sha256: version.sha256,
      };
      const update = (patch: Partial<FileDownloadJob>) => {
        if (enabled.current && sequence === generation.current)
          setJobs((rows) => {
            const current = rows.find(
              (j) => j.record.versionId === record.versionId,
            ) ?? { record, state: "paused" as const, bytes: 0 };
            return [
              ...rows.filter((j) => j.record.versionId !== record.versionId),
              { ...current, ...patch },
            ];
          });
      };
      update({ version, state: "checking", bytes: 0, error: undefined });
      try {
        // Durable identity first; fresh authorization before every range and export.
        await store.save(record);
        ++readSerial.current;
        controller.signal.throwIfAborted();
        const fresh = (await api.version(version.id, controller.signal))
          .version;
        if (
          !fresh.allowedActions.download ||
          fresh.id !== record.versionId ||
          fresh.size !== record.size ||
          fresh.sha256 !== record.sha256
        )
          throw new Error("B2B_FILE_DOWNLOAD_DENIED");
        update({ version: fresh });
        const progress: DownloadProgress = (state, bytes) =>
          update({ state, bytes });
        await receiveInBrowser(
          record,
          api,
          controller.signal,
          progress,
          async (file) => {
            const before = performance.now();
            const ticket = await api.download(
              record.versionId,
              controller.signal,
            );
            controller.signal.throwIfAborted();
            downloadUrl(ticket, record, process.env.NODE_ENV === "development");
            if (!enabled.current || sequence !== generation.current) return;
            if (performance.now() - before >= ticket.expiresIn * 1000)
              throw new Error("B2B_FILE_URL_EXPIRED");
            const previous = objects.current.get(record.versionId);
            if (previous) URL.revokeObjectURL(previous);
            const url = URL.createObjectURL(file);
            objects.current.set(record.versionId, url);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = fresh.name;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
          },
        );
        controller.signal.throwIfAborted();
        if (!enabled.current || sequence !== generation.current) return;
        update({ state: "saved", bytes: record.size });
      } catch (e) {
        update({
          state: "paused",
          error: controller.signal.aborted ? undefined : fileError(e),
          ...([401, 403, 404].includes(
            (e as { response?: { status?: number } })?.response?.status ?? 0,
          ) ||
          (e instanceof Error && e.message === "B2B_FILE_DOWNLOAD_DENIED")
            ? { version: undefined }
            : {}),
        });
        if (
          [401, 403, 404].includes(
            (e as { response?: { status?: number } })?.response?.status ?? 0,
          ) ||
          (e instanceof Error && e.message === "B2B_FILE_DOWNLOAD_DENIED")
        )
          invalidate();
      } finally {
        controllers.current.delete(version.id);
        if (enabled.current)
          setJobs((rows) =>
            rows.map((j) =>
              j.record.versionId === version.id &&
              !controllers.current.has(version.id) &&
              ["checking", "receiving", "authorizing"].includes(j.state)
                ? { ...j, state: "paused" }
                : j,
            ),
          );
      }
    },
    [scope, store, api, invalidate],
  );
  const discard = useCallback(
    async (record: DownloadRecord) => {
      try {
        await discardReceipt(record);
        await store.remove(record);
        ++readSerial.current;
        const url = objects.current.get(record.versionId);
        if (url) URL.revokeObjectURL(url);
        objects.current.delete(record.versionId);
        if (enabled.current)
          setJobs((rows) =>
            rows.filter((j) => j.record.versionId !== record.versionId),
          );
      } catch (e) {
        if (enabled.current) setError(fileError(e));
      }
    },
    [store],
  );
  return {
    jobs: active ? jobs : [],
    error: active ? error : "",
    start,
    discard,
    pause: (id: string) => controllers.current.get(id)?.abort(),
  };
}
