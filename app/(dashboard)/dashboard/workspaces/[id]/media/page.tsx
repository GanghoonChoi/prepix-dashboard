"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  File,
  FolderClosed,
  FolderPlus,
  Pause,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  cloudService,
  type Asset,
  type ArchiveDetail,
  type Folder,
} from "@/lib/api/services/cloud.service";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { useI18n } from "@/lib/i18n/context";
import { bytes, uploadFile } from "@/lib/workspaces/upload";
import { contentGone } from "@/lib/workspaces/errors";
import { isPersonal } from "@/lib/workspaces/kind";
import {
  previewAxis,
  previewFailureIsSpace,
} from "@/lib/workspaces/asset-state";
import {
  canCancel,
  canPause,
  canResume,
  fileRejection,
  isSettled,
  nextQueued,
  patch,
  queueSummary,
  transferProgress,
  type Transfer,
} from "@/lib/workspaces/queue";
import { buildAppOpenUrl } from "@/lib/workspaces/app-link";
import {
  TeamShell,
  SpaceBadge,
  TeamLoading,
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import {
  CloudError,
  CloudProgress,
  cloudErrorCode,
  cloudMessage,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
/**
 * The team archive (D14). A workspace is one team video archive — assets and
 * folders belong to it directly, with no project layer and no per-project ACL
 * in between. Everyone who can reach this page sees the whole archive; the
 * `can*` verdicts below come straight from the server (workspace role), never
 * re-derived from a role string here. Reviewers do not reach the archive at
 * all — the server answers with an error for them, rendered like any other.
 */
export default function MediaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}
function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<ArchiveDetail | null>(null);
  const [team, setTeam] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  // The current folder as a breadcrumb stack of the folder rows already seen,
  // rather than looked up in the response — the archive is fetched one folder
  // at a time (`?folderId=`), so a response only ever carries that folder's
  // own children, never its own name or parent.
  const [path, setPath] = useState<Folder[]>([]);
  const [trash, setTrash] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [showFolder, setShowFolder] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [confirm, setConfirm] = useState<{
    label: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const folderId = path.length ? path[path.length - 1].id : undefined;
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
  const pumping = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const resume = useRef<Asset | undefined>(undefined);
  const alive = useRef(true);
  // F06.1: a custom scheme gives the browser no reliable "it opened" signal,
  // so this never claims success — it fires the link, then reveals a fallback
  // on a fixed timer. No focus/blur guess: the OS's own "open Prepix?" prompt
  // blurs the page too, and cancelling the fallback on that would strand
  // someone who declined it or doesn't have the app with no way back.
  const [appFallback, setAppFallback] = useState(false);
  const appFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (appFallbackTimer.current) clearTimeout(appFallbackTimer.current);
    },
    [],
  );
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
  const load = useCallback(async () => {
    try {
      const next = await cloudService.archive(id, { folderId });
      if (alive.current) {
        setData(next);
        // Every role uploads, so the "which space am I in" stamp cannot depend
        // on being a manager. A failed detail costs the stamp, not the page.
        setTeam(await workspaceService.detail(id).catch(() => null));
      }
    } catch (e) {
      if (alive.current) {
        const code = cloudErrorCode(e);
        setError(code);
        // A failed refresh keeps the archive on screen and the queue running.
        // Only a code that says the archive is gone tears it down (§5.1).
        if (contentGone(code)) {
          setData(null);
          for (const abort of controllers.current.values()) abort.abort();
        }
      }
    }
  }, [id, folderId]);
  useEffect(() => {
    alive.current = true;
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    const running = controllers.current;
    return () => {
      alive.current = false;
      for (const abort of running.values()) abort.abort();
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  const pending = data?.assets.some((a) =>
    ["verifying", "cancelling"].includes(a.state),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, load]);
  const summary = queueSummary(transfers);
  const queueBusy = summary.running + summary.waiting > 0;
  useEffect(() => {
    if (!queueBusy) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [queueBusy]);
  async function action(key: string, run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await run();
      await load();
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy("");
    }
  }
  async function loadMore() {
    const cursor = data?.nextCursor;
    if (!cursor || busy) return;
    setBusy("more");
    setError("");
    try {
      const more = await cloudService.archive(id, { folderId, cursor });
      if (alive.current)
        setData((prev) =>
          prev ? { ...more, assets: [...prev.assets, ...more.assets] } : more,
        );
    } catch (e) {
      if (alive.current) setError(cloudErrorCode(e));
    } finally {
      if (alive.current) setBusy("");
    }
  }
  /**
   * Work the queue one file at a time, and never let one file end it.
   *
   * The loop this replaces shared a single AbortController and a single catch:
   * a throw on file 3 skipped files 4..N entirely and left them with no status,
   * and "pause" aborted the whole batch and told the user to re-pick the rest
   * by hand. Each row now owns its abort and its verdict, and a failure is a
   * `continue`.
   */
  const pump = useCallback(async () => {
    if (pumping.current) return;
    pumping.current = true;
    try {
      for (;;) {
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
            workspaceId: id,
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
              void load();
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
        await load();
      }
    } finally {
      pumping.current = false;
    }
  }, [id, update, load]);
  /**
   * A rejected file is marked in the queue, not a verdict on the selection.
   * Dropping 40 clips with one 0-byte sidecar uploads the other 39 and names
   * the one that was refused.
   */
  function enqueue(selected: File[], resuming?: Asset) {
    if (!data?.canEdit || !data.capabilities.uploadsEnabled || !selected.length)
      return;
    const limit = data.capabilities.maxFileBytes;
    const added: Transfer[] = selected.map((file) => {
      const entryId = crypto.randomUUID();
      handles.current.set(entryId, file);
      destinations.current.set(entryId, folderId);
      if (resuming) resumeAssets.current.set(entryId, resuming);
      const rejected = fileRejection(file, limit);
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
    setNotice("");
    commit([...queue.current, ...added]);
    void pump();
  }
  function pauseTransfer(entry: Transfer) {
    controllers.current.get(entry.id)?.abort();
  }
  function resumeTransfer(entry: Transfer) {
    cancelled.current.delete(entry.id);
    update(entry.id, { state: "queued", error: undefined });
    void pump();
  }
  /**
   * ONE confirmation path, two doors.
   *
   * The queue row and the asset row cancel the same server-side upload, but
   * only the asset row asked first — so the same destructive call had a gate on
   * one route and none on the other. Both doors now ask the same question, in
   * the same dialog, with the same copy.
   *
   * A queued row that never reached the server has no asset to destroy, so
   * there is nothing to confirm — that is an absent consequence, not a skipped
   * gate.
   */
  function cancelTransfer(entry: Transfer) {
    if (!entry.assetId) return void discardTransfer(entry);
    setConfirm({
      label: cancelUploadLabel,
      run: () => discardTransfer(entry),
    });
  }
  async function discardTransfer(entry: Transfer) {
    cancelled.current.add(entry.id);
    controllers.current.get(entry.id)?.abort();
    update(entry.id, { state: "cancelled" });
    if (!entry.assetId) return;
    // Completed files stay; only the file in flight is cancelled (F04.3).
    try {
      await cloudService.cancel(id, entry.assetId);
    } catch {
      /* the asset row keeps its own cancel button for a retry */
    }
    await load();
  }
  function clearSettled() {
    commit(queue.current.filter((entry) => !isSettled(entry.state)));
  }
  async function download(asset: Asset) {
    await action(asset.id, async () => {
      const result = await cloudService.download(id, asset.id);
      const link = document.createElement("a");
      link.href = result.url;
      link.rel = "noopener noreferrer";
      link.download = result.name;
      document.body.append(link);
      link.click();
      link.remove();
      setNotice(
        c(
          "원본 다운로드를 시작했습니다. 앱에서 새 프로젝트를 만들고 이 파일을 가져오세요.",
          "Original download started. Create a local project in the app and import this file.",
        ),
      );
    });
  }
  const cancelUploadLabel = c(
    "이 업로드를 취소할까요? 완료된 조각도 정리하고 용량 예약을 해제합니다. 정리에 몇 분이 걸릴 수 있습니다.",
    "Cancel this upload? Uploaded parts will be cleaned up before the storage reservation is released. Cleanup may take several minutes.",
  );
  const personal = !!team && isPersonal(team.workspace);
  // F06.2: the workspace id only — D14 removes the cloud project, so there is
  // nothing left to name but the archive's workspace. No token, no path, no
  // locale.
  const appLink = data ? buildAppOpenUrl({ workspaceId: id }) : null;
  const downloadAppUrl = `https://www.prepix.ai${lang === "en" ? "" : "/ko"}/download`;
  function openInApp() {
    if (!appLink) return;
    setAppFallback(false);
    window.location.href = appLink;
    if (appFallbackTimer.current) clearTimeout(appFallbackTimer.current);
    appFallbackTimer.current = setTimeout(() => setAppFallback(true), 1500);
  }
  const current = path[path.length - 1];
  const subfolders =
    data?.folders.filter((f) => f.parentId === (folderId ?? null)) ?? [];
  const files =
    data?.assets.filter((a) => (trash ? !!a.trashedAt : !a.trashedAt)) ?? [];
  const canUpload =
    !!data?.canEdit && !!data.capabilities.uploadsEnabled && !trash;
  /**
   * The storage axis, and only that. F04.6 separates storage from preview and
   * from app compatibility, so this no longer folds a preview problem into a
   * storage verdict — see `previewLabel` below.
   */
  const stateLabel = (a: Asset) =>
    a.trashedAt
      ? c("휴지통", "Trash")
      : a.state === "ready"
        ? new Date(a.expiresAt).getTime() <= Date.now()
          ? c("보관 기한 만료", "Expired")
          : c("보관됨", "Stored")
        : a.state === "uploading"
          ? new Date(a.uploadExpiresAt).getTime() <= Date.now()
            ? c("업로드 만료", "Upload expired")
            : c("이어 올리기 대기", "Ready to resume")
          : a.state === "verifying"
            ? c("원본 검증 중", "Verifying original")
            : a.state === "quarantined"
              ? c(
                  "검증 실패 · 다운로드 차단",
                  "Verification failed · download blocked",
                )
              : a.state === "cancelling"
                ? c(
                    "취소 정리 중 · 용량 예약 유지",
                    "Cancelling · storage still reserved",
                  )
                : // `cancelled` is finished, so saying capacity is still held
                  // is simply wrong.
                  c(
                    "취소됨 · 용량 예약 해제",
                    "Cancelled · reservation released",
                  );
  return (
    <TeamShell
      title={
        personal
          ? c("내 아카이브", "Your archive")
          : c("팀 아카이브", "Team archive")
      }
    >
      {appFallback && appLink && (
        <div
          role="status"
          className="space-y-3 rounded-lg border border-border bg-surface p-4 text-sm leading-6"
        >
          <p>
            {c(
              "앱이 열리지 않았나요? Prepix 앱을 설치한 뒤 이 페이지로 돌아오면 같은 워크스페이스를 다시 열 수 있습니다.",
              "App didn't open? Install Prepix, then come back to this page to open the same workspace again.",
            )}
          </p>
          <a
            className={secondaryClass}
            href={downloadAppUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download size={16} strokeWidth={1.5} />
            {c("Prepix 앱 다운로드", "Download the Prepix app")}
          </a>
        </div>
      )}
      {error && (
        <CloudError
          code={error}
          retry={() => {
            setError("");
            void load();
          }}
        />
      )}
      {!data && !error && <TeamLoading />}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
        >
          {notice}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          label={c("작업 확인", "Confirm action")}
          onClose={() => setConfirm(null)}
        >
          <p className="text-sm leading-6">{confirm.label}</p>
          <div className="flex gap-2">
            <button
              className={primaryClass}
              disabled={!!busy}
              onClick={() => {
                void action("confirm", confirm.run).then(() =>
                  setConfirm(null),
                );
              }}
            >
              {c("확인", "Confirm")}
            </button>
            <button
              className={secondaryClass}
              disabled={!!busy}
              onClick={() => setConfirm(null)}
            >
              {c("돌아가기", "Go back")}
            </button>
          </div>
        </ConfirmDialog>
      )}
      {data && (
        <>
          <StorageMeter storage={data.storage} />
          <section
            className="space-y-5"
            onDragOver={(e) => {
              if (canUpload) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (canUpload) enqueue(Array.from(e.dataTransfer.files));
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label={c("폴더 경로", "Folder path")}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                {/*
                  Upload is the durable action on this page, so the space it
                  lands in is named beside it, not only in the switcher.
                */}
                {team && <SpaceBadge workspace={team.workspace} />}
                <button
                  className={secondaryClass}
                  onClick={() => {
                    setTrash(false);
                    setPath([]);
                  }}
                >
                  {c("모든 파일", "All files")}
                </button>
                {current && !trash && (
                  <>
                    <button
                      className={secondaryClass}
                      onClick={() => setPath(path.slice(0, -1))}
                      aria-label={c("상위 폴더", "Parent folder")}
                    >
                      <ArrowLeft size={16} strokeWidth={1.5} />
                    </button>
                    <span className="max-w-60 break-all font-medium">
                      {current.name}
                    </span>
                  </>
                )}
                {trash && <span>{c("휴지통", "Trash")}</span>}
              </nav>
              <div className="flex flex-wrap gap-2">
                {appLink && (
                  <button className={secondaryClass} onClick={openInApp}>
                    <ExternalLink size={16} strokeWidth={1.5} />
                    {c("앱에서 열기", "Open in app")}
                  </button>
                )}
                {data.canEdit && (
                  <button
                    className={secondaryClass}
                    onClick={() => setTrash(!trash)}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                    {trash
                      ? c("파일로 돌아가기", "Back to files")
                      : c("휴지통", "Trash")}
                  </button>
                )}
                {data.canEdit && !trash && (
                  <button
                    className={secondaryClass}
                    disabled={queueBusy}
                    aria-expanded={showFolder}
                    onClick={() => setShowFolder(!showFolder)}
                  >
                    <FolderPlus size={16} strokeWidth={1.5} />
                    {c("새 폴더", "New folder")}
                  </button>
                )}
                {data.canEdit && !trash && (
                  <button
                    className={primaryClass}
                    disabled={!canUpload}
                    onClick={() => {
                      resume.current = undefined;
                      fileInput.current?.click();
                    }}
                  >
                    <Upload size={16} strokeWidth={1.5} />
                    {c("원본 업로드", "Upload originals")}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                e.target.value = "";
                const resuming = resume.current;
                resume.current = undefined;
                enqueue(resuming ? selected.slice(0, 1) : selected, resuming);
              }}
            />
            {!data.capabilities.uploadsEnabled && data.canEdit && (
              <p className="text-sm leading-6 text-muted">
                {c(
                  "이 환경의 새 업로드가 비활성화되어 있습니다. 기존 파일은 계속 관리할 수 있습니다.",
                  "New uploads are disabled in this environment. You can still manage existing files.",
                )}
              </p>
            )}
            {showFolder && data.canEdit && !trash && (
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("folder", async () => {
                    await cloudService.folder(id, folderName, folderId);
                    setFolderName("");
                    setShowFolder(false);
                  });
                }}
              >
                <input
                  aria-label={c("폴더 이름", "Folder name")}
                  required
                  maxLength={120}
                  className={inputClass}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
                <button
                  className={primaryClass}
                  disabled={!!busy || !folderName.trim()}
                >
                  {c("폴더 만들기", "Create folder")}
                </button>
              </form>
            )}
            {transfers.length > 0 && (
              <section
                aria-label={c("전송 패널", "Transfer panel")}
                className="space-y-4 rounded-xl border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Five counters, four of them usually zero. Only what is
                      actually happening earns a place on the line. */}
                  <p role="status" className="text-sm tabular-nums">
                    {[
                      [summary.running, c("진행", "running")] as const,
                      [summary.waiting, c("대기", "waiting")] as const,
                      [summary.done, c("완료", "done")] as const,
                      [summary.failed, c("실패", "failed")] as const,
                    ]
                      .filter(([count]) => count > 0)
                      .map(([count, label]) =>
                        lang === "ko"
                          ? `${label} ${count}`
                          : `${count} ${label}`,
                      )
                      .join(" · ") ||
                      c(
                        `전송 ${summary.total}개`,
                        `${summary.total} transfers`,
                      )}
                  </p>
                  {transfers.some((entry) => isSettled(entry.state)) && (
                    <button className={secondaryClass} onClick={clearSettled}>
                      {c("끝난 항목 지우기", "Clear finished")}
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-border">
                  {transfers.map((entry) => {
                    const shown = transferProgress(entry);
                    return (
                      <li key={entry.id} className="space-y-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="min-w-0 break-all text-sm">
                            {entry.name}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {canPause(entry.state) && (
                              <button
                                className={secondaryClass}
                                onClick={() => pauseTransfer(entry)}
                              >
                                <Pause size={16} strokeWidth={1.5} />
                                {c("멈추기", "Pause")}
                              </button>
                            )}
                            {canResume(entry.state) && (
                              <button
                                className={secondaryClass}
                                onClick={() => resumeTransfer(entry)}
                              >
                                <Play size={16} strokeWidth={1.5} />
                                {c("이어 올리기", "Resume")}
                              </button>
                            )}
                            {canCancel(entry.state) && (
                              <button
                                className={secondaryClass}
                                onClick={() => void cancelTransfer(entry)}
                              >
                                <X size={16} strokeWidth={1.5} />
                                {c("취소", "Cancel")}
                              </button>
                            )}
                          </div>
                        </div>
                        <CloudProgress
                          value={shown.value}
                          max={shown.max}
                          label={`${entry.name} ${c("전송 진행률", "transfer progress")}`}
                        />
                        <p className="text-xs leading-5 text-muted tabular-nums">
                          {entry.state === "queued"
                            ? c("대기 중", "Waiting")
                            : entry.state === "hashing"
                              ? c("파일 확인 중", "Checking file")
                              : entry.state === "uploading"
                                ? c("업로드 중", "Uploading")
                                : entry.state === "verifying"
                                  ? c(
                                      "전송 완료 확인 중",
                                      "Finalizing transfer",
                                    )
                                  : entry.state === "done"
                                    ? c(
                                        "전송 완료 · 검증 후 다운로드 가능",
                                        "Transferred · downloadable after verification",
                                      )
                                    : entry.state === "paused"
                                      ? c("멈춤", "Paused")
                                      : entry.state === "cancelled"
                                        ? c("취소됨", "Cancelled")
                                        : entry.state === "invalid"
                                          ? c(
                                              "업로드할 수 없음",
                                              "Cannot upload",
                                            )
                                          : c("실패", "Failed")}{" "}
                          · {bytes(shown.value)} / {bytes(entry.total)}
                        </p>
                        {entry.error && (
                          <p className="text-xs leading-5" role="alert">
                            {cloudMessage(entry.error, lang)}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {editing && (
              <form
                className="space-y-4 rounded-xl border border-border bg-surface p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("edit", async () => {
                    await cloudService.update(id, editing.id, {
                      name: editName,
                      folderId: editFolder || null,
                    });
                    setEditing(null);
                  });
                }}
              >
                <label className="block text-sm">
                  {c("파일 이름", "File name")}
                  <input
                    className={`${inputClass} mt-2`}
                    required
                    maxLength={255}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  {c("이동할 폴더", "Destination folder")}
                  <select
                    className={`${inputClass} mt-2`}
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                  >
                    <option value="">{c("모든 파일", "All files")}</option>
                    {data.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button className={primaryClass} disabled={!!busy}>
                    {c("변경 저장", "Save changes")}
                  </button>
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() => setEditing(null)}
                  >
                    {c("취소", "Cancel")}
                  </button>
                </div>
              </form>
            )}
            <ul className="divide-y divide-border rounded-xl border border-border">
              {!trash &&
                subfolders.map((f) => (
                  <li key={f.id}>
                    <button
                      className="flex min-h-16 w-full items-center gap-3 p-5 text-left text-sm transition-colors hover:bg-surface"
                      onClick={() => setPath([...path, f])}
                    >
                      <FolderClosed size={20} strokeWidth={1.5} />
                      <span className="break-all">{f.name}</span>
                    </button>
                  </li>
                ))}
              {files.map((asset) => {
                const ready = asset.state === "ready";
                const active =
                  !asset.trashedAt &&
                  ready &&
                  new Date(asset.expiresAt).getTime() > Date.now();
                const preview = previewAxis(asset, lang);
                return (
                  /* A row, not a card. Three stacked lines and a button bar
                     per file reads fine at one file and is unusable at fifty,
                     which is the number this archive is built for. */
                  <li
                    key={asset.id}
                    className="flex items-center gap-x-3 px-5 py-3 transition-colors hover:bg-foreground/[0.02]"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <File
                        size={20}
                        strokeWidth={1.5}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-all text-sm font-medium">
                          {asset.name}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted tabular-nums">
                          {bytes(asset.size)} · {stateLabel(asset)}
                          {ready &&
                            ` · ${c("보관 기한", "Expires")} ${new Date(
                              asset.expiresAt,
                            ).toLocaleDateString(lang)}`}
                        </p>
                        {preview && (
                          <p className="mt-1 text-xs leading-5">
                            {preview}
                            {asset.previewState === "failed" &&
                              asset.failure && (
                                <>
                                  {" "}
                                  <span className="font-mono text-muted">
                                    {asset.failure}
                                  </span>
                                  {previewFailureIsSpace(asset.failure) && (
                                    <button
                                      className="ml-2 underline underline-offset-4"
                                      onClick={() => setTrash(true)}
                                    >
                                      {c(
                                        "저장공간 정리하기",
                                        "Free up storage",
                                      )}
                                    </button>
                                  )}
                                </>
                              )}
                          </p>
                        )}
                      </div>
                    </div>
                    {/* One row, one visible action. Five buttons per file
                        turned a fifty-file archive into a wall of chrome and
                        made the one thing people come here for — the original
                        — no easier to reach than "영구 삭제". Download stays
                        out front; the rest sit behind the same kebab the
                        members table uses. */}
                    <div className="flex shrink-0 items-center gap-1">
                      {active && data.canDownload && (
                        <button
                          className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                          disabled={!!busy}
                          title={c("원본 다운로드", "Download original")}
                          aria-label={c("원본 다운로드", "Download original")}
                          onClick={() => {
                            void download(asset);
                          }}
                        >
                          <Download size={16} strokeWidth={1.5} />
                        </button>
                      )}
                      <RowMenu label={c("파일 작업", "File actions")}>
                        {data.canEdit && ready && !trash && (
                          <>
                            <RowMenuItem
                              disabled={!!busy}
                              onClick={() => {
                                setEditing(asset);
                                setEditName(asset.name);
                                setEditFolder(asset.folderId ?? "");
                              }}
                            >
                              {c("이름과 폴더 변경", "Rename or move")}
                            </RowMenuItem>
                            <RowMenuItem
                              tone="danger"
                              disabled={!!busy}
                              onClick={() =>
                                setConfirm({
                                  label: c(
                                    `${asset.name} 파일을 휴지통으로 옮길까요? 팀원의 다운로드가 중단됩니다.`,
                                    `Move ${asset.name} to trash? Team members will no longer be able to download it.`,
                                  ),
                                  run: () =>
                                    cloudService.update(id, asset.id, {
                                      trashed: true,
                                    }),
                                })
                              }
                            >
                              {c("휴지통으로", "Move to trash")}
                            </RowMenuItem>
                          </>
                        )}
                        {data.canEdit && ready && trash && (
                          <RowMenuItem
                            disabled={
                              !!busy ||
                              new Date(asset.expiresAt).getTime() <= Date.now()
                            }
                            onClick={() => {
                              void action(asset.id, () =>
                                cloudService.update(id, asset.id, {
                                  trashed: false,
                                }),
                              );
                            }}
                          >
                            {c("복구", "Restore")}
                          </RowMenuItem>
                        )}
                        {data.canPurge && ready && trash && (
                          <RowMenuItem
                            tone="danger"
                            disabled={!!busy}
                            onClick={() =>
                              setConfirm({
                                label: c(
                                  `${asset.name} 파일을 영구 삭제할까요? 원본을 복구할 수 없습니다. 저장소 정리가 끝난 뒤 용량이 반환됩니다.`,
                                  `Permanently delete ${asset.name}? The original cannot be recovered. Capacity is released after storage cleanup finishes.`,
                                ),
                                run: () =>
                                  cloudService.purge(id, asset.id, asset.name),
                              })
                            }
                          >
                            {c("영구 삭제", "Delete permanently")}
                          </RowMenuItem>
                        )}
                        {asset.state === "uploading" &&
                          data.canEdit &&
                          asset.createdBy === data.currentUserId &&
                          new Date(asset.uploadExpiresAt).getTime() >
                            Date.now() && (
                            <RowMenuItem
                              disabled={!canUpload}
                              onClick={() => {
                                resume.current = asset;
                                fileInput.current?.click();
                              }}
                            >
                              {c(
                                "같은 파일로 이어 올리기",
                                "Select original to resume",
                              )}
                            </RowMenuItem>
                          )}
                        {data.canEdit &&
                          ["uploading", "quarantined", "verifying"].includes(
                            asset.state,
                          ) && (
                            <RowMenuItem
                              tone="danger"
                              disabled={!!busy}
                              onClick={() =>
                                setConfirm({
                                  label: cancelUploadLabel,
                                  run: () => cloudService.cancel(id, asset.id),
                                })
                              }
                            >
                              {c("업로드 취소", "Cancel upload")}
                            </RowMenuItem>
                          )}
                      </RowMenu>
                    </div>
                  </li>
                );
              })}
              {!files.length && (trash || !subfolders.length) && (
                <li className="space-y-3 p-10 text-center">
                  <Upload
                    className="mx-auto text-muted"
                    size={28}
                    strokeWidth={1.5}
                  />
                  <h3 className="font-medium">
                    {trash
                      ? c("휴지통이 비어 있습니다", "Trash is empty")
                      : c("첫 원본을 올려보세요", "Upload your first original")}
                  </h3>
                  <p className="text-sm leading-6 text-muted">
                    {trash
                      ? c(
                          "휴지통 파일은 저장 용량에 포함됩니다.",
                          "Trashed files still count toward storage.",
                        )
                      : data.canEdit
                        ? c(
                            "파일을 이 영역에 놓거나 원본 업로드를 선택하세요.",
                            "Drop files here or choose Upload originals.",
                          )
                        : c(
                            "아카이브에 원본이 추가되면 여기에 표시됩니다.",
                            "Originals added to this archive will appear here.",
                          )}
                  </p>
                </li>
              )}
            </ul>
            {data.nextCursor && (
              <button
                className={secondaryClass}
                onClick={() => void loadMore()}
              >
                {c("더 불러오기", "Load more")}
              </button>
            )}
            {/* The only part of the old footnote a person acts on is the
                limit. The rest — any format is accepted, uploading starts no
                analysis — describes things that do not happen, and a caveat
                about what the product will NOT do reads as reassurance the
                first time and clutter every time after. */}
            <p className="text-xs leading-5 text-muted tabular-nums">
              {c(
                `파일당 최대 ${bytes(data.capabilities.maxFileBytes)}`,
                `Up to ${bytes(data.capabilities.maxFileBytes)} per file`,
              )}
            </p>
          </section>
        </>
      )}
    </TeamShell>
  );
}
