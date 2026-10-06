"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  TeamFileCapabilities,
  TeamFileKind,
  TeamFileUpload,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import { fileApi, fileError, type FileScope } from "@/lib/b2b-files/api";
import {
  BrowserTransferStore,
  type TransferRecord,
} from "@/lib/b2b-files/store";
import {
  prepareTransfer,
  resumeTransfer,
  cancelTransfer,
  matchesUpload,
  type TransferPhase,
} from "@/lib/b2b-files/transfer";
import { bytes } from "@/lib/workspaces/upload";
import {
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";

type Job = {
  id: string;
  name: string;
  size: number;
  kind: TeamFileKind;
  existingAssetId?: string;
  file?: File;
  record?: TransferRecord;
  upload?: TeamFileUpload;
  phase: TransferPhase | "queued" | "paused" | "cancelled";
  loaded: number;
  error: string;
  visible: boolean;
  running: boolean;
  generation: number;
};
export function FileTransfers({
  scope,
  capabilities,
  versions,
  changed,
}: {
  scope: FileScope;
  capabilities: TeamFileCapabilities;
  versions: TeamFileVersion[];
  changed: () => void;
}) {
  const c = useCopy(),
    api = useMemo(() => fileApi(scope), [scope]),
    store = useMemo(() => new BrowserTransferStore(), []);
  const jobs = useRef<Job[]>([]),
    alive = useRef(false),
    controllers = useRef(new Map<string, AbortController>());
  const preparing = useRef(new Map<string, Promise<TransferRecord>>());
  const changedRef = useRef(changed);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  const [rows, setRows] = useState<Job[]>([]),
    [error, setError] = useState(""),
    [restoring, setRestoring] = useState(true);
  const [kind, setKind] = useState<TeamFileKind>("original"),
    [asset, setAsset] = useState("");
  const [selected, setSelected] = useState<File[]>([]),
    inputRef = useRef<HTMLInputElement>(null);
  const publish = () => {
    if (alive.current) setRows([...jobs.current]);
  };
  const update = (job: Job, generation: number, next: Partial<Job>) => {
    if (!alive.current || job.generation !== generation) return;
    Object.assign(job, next);
    publish();
  };
  const inaccessible = (e: unknown) =>
    [401, 403, 404].includes(
      (e as { response?: { status?: number } })?.response?.status ?? 0,
    ) || fileError(e) === "B2B_FILE_ACCOUNT_CHANGED";
  const run = async (job: Job, file?: File) => {
    if (!alive.current || job.running || !capabilities.uploadsEnabled) return;
    const controller = new AbortController(),
      generation = ++job.generation;
    controllers.current.set(job.id, controller);
    Object.assign(job, {
      running: true,
      file: file ?? job.file,
      error: "",
      visible: true,
    });
    publish();
    const progress = (phase: TransferPhase, loaded: number) =>
      update(job, generation, { phase, loaded });
    try {
      if (!job.record) {
        if (!job.file) throw new Error("B2B_FILE_RESELECT_REQUIRED");
        const pending = prepareTransfer({
          file: job.file,
          scope,
          kind: job.kind,
          existingAssetId: job.existingAssetId,
          maxFileBytes: capabilities.policy!.maxFileBytes,
          store,
          signal: controller.signal,
          progress,
        });
        preparing.current.set(job.id, pending);
        const record = await pending;
        job.record = record;
        update(job, generation, { record });
      }
      controller.signal.throwIfAborted();
      if (!job.record) return;
      const upload = await resumeTransfer({
        record: job.record,
        file: job.file,
        api,
        store,
        signal: controller.signal,
        progress,
        saved: (record) => update(job, generation, { record }),
      });
      update(job, generation, {
        upload,
        phase:
          upload.state === "uploading" || upload.state === "preparing"
            ? "paused"
            : "verifying",
        error: "",
      });
      changedRef.current();
    } catch (e) {
      const paused = controller.signal.aborted;
      update(job, generation, {
        phase: "paused",
        error: paused ? "" : fileError(e),
        visible: paused || !inaccessible(e),
      });
    } finally {
      preparing.current.delete(job.id);
      if (controllers.current.get(job.id) === controller)
        controllers.current.delete(job.id);
      update(job, generation, { running: false });
    }
  };
  const cancel = async (job: Job) => {
    controllers.current.get(job.id)?.abort();
    const generation = ++job.generation,
      controller = new AbortController();
    controllers.current.set(job.id, controller);
    Object.assign(job, { running: true, error: "" });
    publish();
    try {
      if (!job.record && preparing.current.has(job.id)) {
        // A cancellation during the durable write waits for its receipt. It
        // cannot claim that no intent exists just because the UI hasn't got it.
        try {
          job.record = await preparing.current.get(job.id);
        } catch {
          /* Hash aborted before any intent was persisted. */
        }
      }
      if (!job.record) {
        // No persisted intent means begin has never been sent. An interrupted
        // hash/record write observes its aborted signal before any network call.
        update(job, generation, { phase: "cancelled" });
        return;
      }
      const record = await store.save({ ...job.record, cancelRequested: true });
      update(job, generation, { record });
      await cancelTransfer(record, api, store, controller.signal);
      update(job, generation, { phase: "cancelled" });
      changedRef.current();
    } catch (e) {
      if (!controller.signal.aborted)
        update(job, generation, {
          error: fileError(e),
          visible: !inaccessible(e),
        });
    } finally {
      if (controllers.current.get(job.id) === controller)
        controllers.current.delete(job.id);
      update(job, generation, { running: false });
    }
  };
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController(),
      active = controllers.current;
    let reading = false;
    const refresh = async (initial = false) => {
      if (reading || controller.signal.aborted) return;
      reading = true;
      try {
        if (initial) {
          const saved = await store.list(scope);
          if (controller.signal.aborted) return;
          jobs.current = saved.map((record) => ({
            id: record.input.requestKey,
            record,
            name: record.input.name,
            size: record.input.size,
            kind: record.input.kind,
            existingAssetId: record.input.existingAssetId,
            phase: "paused",
            loaded: 0,
            error: "",
            visible: false,
            running: false,
            generation: 0,
          }));
        }
        for (const job of jobs.current) {
          if (job.running || !job.record) continue;
          try {
            const result = await api.lookup(
              job.record.input.requestKey,
              controller.signal,
            );
            if (controller.signal.aborted) return;
            if (result.currentUserId !== scope.userId)
              throw new Error("B2B_FILE_ACCOUNT_CHANGED");
            if (result.upload && !matchesUpload(job.record, result.upload))
              throw new Error("B2B_FILE_TRANSFER_RECORD_CONFLICT");
            Object.assign(job, {
              visible: true,
              upload: result.upload ?? undefined,
              ...(result.cancelled ? { phase: "cancelled", error: "" } : {}),
            });
            if (
              job.record.cancelRequested &&
              !result.cancelled &&
              result.upload?.state !== "ready"
            )
              void cancel(job);
          } catch (e) {
            if (!controller.signal.aborted)
              Object.assign(job, { visible: false, error: fileError(e) });
          }
        }
        publish();
      } catch (e) {
        if (!controller.signal.aborted) setError(fileError(e));
      } finally {
        reading = false;
        if (!controller.signal.aborted) setRestoring(false);
      }
    };
    const start = window.setTimeout(() => void refresh(true), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      controller.abort();
      active.forEach((c) => c.abort());
      active.clear();
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
    // Scope mounts are keyed by service/account/team/project. Background reads
    // deliberately preserve the current file selection and in-flight job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, store, scope]);
  const series = [
    ...new Map(
      versions
        .filter((v) => v.allowedActions.manage && v.kind === kind)
        .map((v) => [v.assetId, v]),
    ).values(),
  ];
  const label = (job: Job) => {
    if (!job.visible)
      return c("전송 접근 확인 필요", "Transfer access needs verification");
    if (job.phase === "cancelled")
      return c(
        "취소 확인됨 · 임시 자료 정리는 별도 진행",
        "Cancellation confirmed; cleanup continues separately",
      );
    if (job.running)
      return job.phase === "hashing"
        ? c("파일 해시 계산 중", "Hashing file")
        : job.phase === "uploading"
          ? c("전송 중", "Uploading")
          : c("처리 중", "Processing");
    const state = job.upload?.state;
    if (state === "ready")
      return c("보관됨 · 미리보기 미생성", "Stored; preview not generated");
    if (state === "verifying")
      return c("보안·파일 검사 중", "Security and file checks pending");
    if (state === "quarantined")
      return c(
        "격리됨 · 공유와 다운로드 불가",
        "Quarantined; sharing and download unavailable",
      );
    if (state === "expired") return c("전송 만료됨", "Transfer expired");
    if (state === "cancelled")
      return c("취소됨 · 정리 상태 확인 중", "Cancelled; checking cleanup");
    return c(
      "중단됨 · 원본을 선택해 이어 보내세요",
      "Paused; choose the source to resume",
    );
  };
  return (
    <section
      className="space-y-5 border-b border-border pb-8"
      aria-label={c("자료 전송", "File transfers")}
    >
      <div>
        <h2 className="font-medium">
          {c("자료 추가와 전송", "Add and transfer files")}
        </h2>
        <p className="mt-2 max-w-3xl text-pretty text-sm leading-6 text-muted">
          {c(
            "팀 클라우드에 보관합니다. 처음에는 업로더와 내부 자료 담당자만 접근하며, 이름이 같은 파일도 자동으로 덮어쓰지 않습니다.",
            "Files are stored in team cloud storage. Initial access is limited to the uploader and internal asset steward. Matching names never overwrite files.",
          )}
        </p>
      </div>
      {error && <B2bError code={error} />}
      {capabilities.uploadsEnabled && capabilities.policy ? (
        <form
          className="max-w-2xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (restoring || !selected.length || error) return;
            const additions: Job[] = selected.map((file) => ({
              id: crypto.randomUUID(),
              name: file.name,
              size: file.size,
              kind,
              existingAssetId: asset || undefined,
              file,
              phase: "queued",
              loaded: 0,
              error: "",
              visible: true,
              running: false,
              generation: 0,
            }));
            jobs.current.push(...additions);
            setSelected([]);
            if (inputRef.current) inputRef.current.value = "";
            publish();
            for (const job of additions) {
              if (!alive.current) break;
              if (job.phase !== "cancelled") await run(job);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span>{c("자료 종류", "File kind")}</span>
              <select
                className={inputClass}
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as TeamFileKind);
                  setAsset("");
                }}
              >
                <option value="original">{c("원본", "Original")}</option>
                <option value="output">{c("결과물", "Output")}</option>
                <option value="working">
                  {c("작업 자료", "Working files")}
                </option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span>{c("등록 방식", "Registration")}</span>
              <select
                className={inputClass}
                value={asset}
                onChange={(e) => setAsset(e.target.value)}
              >
                <option value="">{c("새 자료", "New asset")}</option>
                {series.map((v) => (
                  <option key={v.assetId} value={v.assetId}>
                    {c("기존 자료의 새 버전", "New version")}: {v.assetName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-2 text-sm">
            <span>{c("보관할 파일", "Files to store")}</span>
            <input
              ref={inputRef}
              type="file"
              multiple
              className={inputClass}
              onChange={(e) => setSelected(Array.from(e.target.files ?? []))}
            />
          </label>
          <p className="text-sm text-muted">
            {c("파일당 최대", "Maximum per file")}{" "}
            {bytes(capabilities.policy.maxFileBytes)}.{" "}
            {c("지원 컨테이너", "Supported containers")}:{" "}
            {capabilities.policy.formats.join(", ")}.{" "}
            {c(
              "실제 형식은 서버에서 검사합니다.",
              "Actual format is checked on the server.",
            )}
          </p>
          <button
            className={primaryClass}
            disabled={restoring || !selected.length || !!error}
            type="submit"
          >
            {c("팀에 보관 시작", "Store in team")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">
          {c(
            "현재 프로젝트에서 새 자료 등록을 사용할 수 없습니다. 참여 권한, 이용 상태와 업로드 설정을 확인해 주세요.",
            "New uploads are unavailable. Check participation, team status and upload configuration.",
          )}
        </p>
      )}
      {restoring && (
        <p className="text-sm text-muted" role="status">
          {c(
            "이 계정의 전송 기록 확인 중",
            "Checking this account's transfer records",
          )}
        </p>
      )}
      <ul className="divide-y divide-border">
        {rows.map((job) => {
          const terminal =
            job.phase === "cancelled" ||
            ["ready", "cancelled", "expired", "quarantined"].includes(
              job.upload?.state ?? "",
            );
          const verifying = job.upload?.state === "verifying";
          return (
            <li key={job.id} className="space-y-3 py-4">
              <div>
                <p className="break-all text-sm font-medium">
                  {job.visible
                    ? job.name
                    : c("확인할 수 없는 전송", "Unavailable transfer")}
                </p>
                <p className="mt-1 text-sm text-muted" role="status">
                  {label(job)}
                  {job.visible && (
                    <span className="ml-2 tabular-nums">{bytes(job.size)}</span>
                  )}
                </p>
              </div>
              {job.running &&
                job.visible &&
                (job.phase === "hashing" || job.phase === "uploading") && (
                  <progress
                    className="w-full accent-foreground"
                    max={job.size}
                    value={job.loaded}
                    aria-label={label(job)}
                  />
                )}
              {job.error && <B2bError code={job.error} />}
              <div className="flex flex-wrap gap-2">
                {job.running && job.phase !== "cancelled" && (
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() => controllers.current.get(job.id)?.abort()}
                  >
                    {c("일시 중단", "Pause")}
                  </button>
                )}
                {!job.running &&
                  job.visible &&
                  !terminal &&
                  !verifying &&
                  !job.record?.cancelRequested &&
                  capabilities.uploadsEnabled && (
                    <label
                      className={`${secondaryClass} relative cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground`}
                    >
                      <span>
                        {c("원본 선택 후 재개", "Choose source to resume")}
                      </span>
                      <input
                        type="file"
                        aria-label={c(
                          `${job.name} 원본 선택 후 재개`,
                          `Choose source for ${job.name}`,
                        )}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (file) void run(job, file);
                        }}
                      />
                    </label>
                  )}
                {!job.running &&
                  job.visible &&
                  job.record &&
                  !terminal &&
                  !verifying &&
                  !job.record?.cancelRequested &&
                  capabilities.uploadsEnabled && (
                    <button
                      type="button"
                      className={secondaryClass}
                      onClick={() => void run(job)}
                    >
                      {c("등록 결과 확인", "Check registration")}
                    </button>
                  )}
                {!job.running && job.visible && !terminal && (
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() => void cancel(job)}
                  >
                    {job.record?.cancelRequested
                      ? c("취소 결과 재확인", "Retry cancellation")
                      : c("전송 취소", "Cancel transfer")}
                  </button>
                )}
                {!job.running && terminal && (
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={async () => {
                      try {
                        if (job.record) await store.remove(job.record);
                        if (!alive.current) return;
                        jobs.current = jobs.current.filter((j) => j !== job);
                        publish();
                      } catch (e) {
                        update(job, job.generation, { error: fileError(e) });
                      }
                    }}
                  >
                    {c("전송 기록 닫기", "Dismiss transfer record")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
