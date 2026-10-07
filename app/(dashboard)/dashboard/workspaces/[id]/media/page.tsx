"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayState } from "@heroui/react";
import {
  ChevronRight,
  ExternalLink,
  LayoutGrid,
  List,
  Upload,
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
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { bytes } from "@/lib/workspaces/upload";
import { contentGone } from "@/lib/workspaces/errors";
import { isPersonal } from "@/lib/workspaces/kind";
import { type Transfer } from "@/lib/workspaces/queue";
import { useUploadQueue } from "@/lib/workspaces/use-upload-queue";
import {
  isPlayable,
  nextSort,
  sortAssets,
  type ArchiveSort,
  type ArchiveView,
} from "@/lib/workspaces/archive-view";
import { posterKey, readPosters } from "@/lib/workspaces/poster-cache";
import { buildAppOpenUrl } from "@/lib/workspaces/app-link";
import {
  TeamShell,
  SpaceBadge,
  TeamLoading,
  ConfirmDialog,
  EmptyState,
  Notice,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import {
  CloudError,
  cloudErrorCode,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
import { AssetGrid } from "@/components/workspaces/archive/asset-grid";
import { AssetList } from "@/components/workspaces/archive/asset-list";
import { PreviewModal } from "@/components/workspaces/archive/preview-modal";
import { TransferPanel } from "@/components/workspaces/archive/transfer-panel";
import type { ArchiveHandlers } from "@/components/workspaces/archive/asset-actions";

/**
 * The team archive (D14). A workspace is one team video archive — assets and
 * folders belong to it directly, with no project layer and no per-project ACL
 * in between. Everyone who can reach this page sees the whole archive; the
 * `can*` verdicts below come straight from the server (workspace role), never
 * re-derived from a role string here. Reviewers do not reach the archive at
 * all — the server answers with an error for them, rendered like any other.
 *
 * This file is assembly. The upload machine lives in `use-upload-queue`, the
 * two views and the player in `components/workspaces/archive/*`, and the
 * ordering and playability rules in `lib/workspaces/archive-view`. It was one
 * 1,090-line component, which is why adding a second view to it meant reading
 * all of it first.
 */
const VIEW_STORAGE_KEY = "prepix.archive.view";

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
  const legacy = !!useWorkspace()?.b2b?.enrolled;
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
  /**
   * One clock, ticking, instead of `Date.now()` scattered through render.
   *
   * Retention and upload windows run out while the page is open, so a row that
   * says 보관됨 has to become 보관 기한 만료 on its own — and reading the wall
   * clock during render makes what a component shows depend on when React
   * re-ran it, which is the impurity the lint rule is about.
   */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // A view preference belongs to the person at this browser, not to the team,
  // so it never travels to the server. Read lazily: `localStorage` does not
  // exist while this renders on the server.
  const [view, setView] = useState<ArchiveView>("list");
  const [sort, setSort] = useState<ArchiveSort>({
    key: "createdAt",
    dir: "desc",
  });
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      /* a blocked store costs the preference, not the page */
    }
  }, []);
  const chooseView = (next: ArchiveView) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* see above */
    }
  };

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
          queue.abortAll();
        }
      }
    }
    // `queue` is created below and is stable across renders; listing it here
    // would be a cycle for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, folderId]);

  const queue = useUploadQueue({
    workspaceId: id,
    folderId,
    canEdit: !!data?.canEdit,
    uploadsEnabled: !!data?.capabilities.uploadsEnabled,
    maxFileBytes: data?.capabilities.maxFileBytes ?? 0,
    reload: load,
    onEnqueue: () => setNotice(""),
  });

  useEffect(() => {
    alive.current = true;
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
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
      setNotice(c("원본 다운로드를 시작했습니다.", "Original download started."));
    });
  }

  const cancelUploadLabel = c(
    "이 업로드를 취소할까요? 완료된 조각도 정리하고 용량 예약을 해제합니다. 정리에 몇 분이 걸릴 수 있습니다.",
    "Cancel this upload? Uploaded parts will be cleaned up before the storage reservation is released. Cleanup may take several minutes.",
  );

  /**
   * ONE confirmation path, two doors.
   *
   * The queue row and the asset row cancel the same server-side upload, but
   * only the asset row asked first — so the same destructive call had a gate on
   * one route and none on the other. Both doors ask the same question, in the
   * same dialog, with the same copy. A queued row that never reached the server
   * has no asset to destroy, so there is nothing to confirm.
   */
  function cancelTransfer(entry: Transfer) {
    if (!queue.needsConfirm(entry)) return void queue.discard(entry);
    setConfirm({ label: cancelUploadLabel, run: () => queue.discard(entry) });
  }

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
  const files = useMemo(
    () =>
      sortAssets(
        (data?.assets ?? []).filter((a) => (trash ? !!a.trashedAt : !a.trashedAt)),
        sort,
      ),
    [data?.assets, trash, sort],
  );
  const canUpload =
    !!data?.canEdit && !!data.capabilities.uploadsEnabled && !trash;

  // Only what a player could actually open, in the order on screen — the
  // modal's prev/next walks this, not the raw list, so it never lands on a row
  // whose bytes the server would refuse.
  const playable = useMemo(
    () => (data?.canDownload ? files.filter((a) => isPlayable(a, now)) : []),
    [files, data?.canDownload, now],
  );
  const preview = useOverlayState();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [posters, setPosters] = useState<Map<string, string>>(new Map());
  // Posters only matter to the grid, so nothing is read from the store until
  // somebody switches to it.
  useEffect(() => {
    if (view !== "grid" || !files.length) return;
    let live = true;
    void readPosters(files.map((asset) => posterKey(asset))).then((found) => {
      if (live && found.size) setPosters((prev) => new Map([...prev, ...found]));
    });
    return () => {
      live = false;
    };
  }, [view, files]);

  function openPreview(asset: Asset) {
    const at = playable.findIndex((row) => row.id === asset.id);
    if (at < 0) return;
    setPreviewIndex(at);
    preview.open();
  }

  const handlers: ArchiveHandlers | null = data && {
    workspaceId: id,
    data,
    trash,
    busy,
    canUpload,
    cancelUploadLabel,
    now,
    onDownload: (asset) => void download(asset),
    onEdit: (asset) => {
      setEditing(asset);
      setEditName(asset.name);
      setEditFolder(asset.folderId ?? "");
    },
    onResume: (asset) => {
      resume.current = asset;
      fileInput.current?.click();
    },
    onAction: (key, run) => void action(key, run),
    onConfirm: (label, run) => setConfirm({ label, run }),
  };

  const crumb =
    "rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-surface-secondary hover:text-foreground";
  const chevron = (
    <ChevronRight
      size={14}
      strokeWidth={1.75}
      aria-hidden="true"
      className="shrink-0 text-muted"
    />
  );

  return (
    <TeamShell
      title={
        personal
          ? c("내 아카이브", "Your archive")
          : // A B2B team keeps its pre-B2B files here; the nav names it so.
            legacy
            ? c("기존 아카이브", "Legacy archive")
            : c("팀 아카이브", "Team archive")
      }
      actions={
        data && (
          <>
            {appLink && (
              <button className={secondaryClass} onClick={openInApp}>
                <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("앱에서 열기", "Open in app")}
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
                <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("원본 업로드", "Upload originals")}
              </button>
            )}
          </>
        )
      }
    >
      {appFallback && appLink && (
        <Notice role="status">
          {c("앱이 열리지 않았나요? ", "App didn't open? ")}
          <a
            className="underline underline-offset-2"
            href={downloadAppUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            {c("Prepix 앱 다운로드", "Download the Prepix app")}
          </a>
          {c(" 후 다시 시도하세요.", ", then try again.")}
        </Notice>
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
      {notice && <Notice role="status">{notice}</Notice>}
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
      {data && handlers && (
        <>
          <section
            className="space-y-4"
            onDragOver={(e) => {
              if (canUpload) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (canUpload) queue.enqueue(Array.from(e.dataTransfer.files));
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label={c("폴더 경로", "Folder path")}
                className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
              >
                {/*
                  Upload is the durable action on this page, so the space it
                  lands in is named at the root of where it lands, not only in
                  the switcher.
                */}
                {team && (
                  <span className="mr-1">
                    <SpaceBadge workspace={team.workspace} />
                  </span>
                )}
                {current || trash ? (
                  <button
                    className={crumb}
                    onClick={() => {
                      setTrash(false);
                      setPath([]);
                    }}
                  >
                    {c("모든 파일", "All files")}
                  </button>
                ) : (
                  <span aria-current="page" className="px-1.5 py-1 font-medium">
                    {c("모든 파일", "All files")}
                  </span>
                )}
                {/* The trash is per folder (the archive is fetched one folder
                    at a time), so its path stays on screen and every step of
                    it is a way back out. */}
                {path.map((folder, i) =>
                  !trash && i === path.length - 1 ? (
                    <span key={folder.id} className="flex min-w-0 items-center gap-1">
                      {chevron}
                      <span
                        aria-current="page"
                        className="max-w-60 break-all px-1.5 py-1 font-medium"
                      >
                        {folder.name}
                      </span>
                    </span>
                  ) : (
                    <span key={folder.id} className="flex min-w-0 items-center gap-1">
                      {chevron}
                      <button
                        className={`${crumb} max-w-60 break-all`}
                        onClick={() => {
                          setTrash(false);
                          setPath(path.slice(0, i + 1));
                        }}
                      >
                        {folder.name}
                      </button>
                    </span>
                  ),
                )}
                {trash && (
                  <span className="flex items-center gap-1">
                    {chevron}
                    <span aria-current="page" className="px-1.5 py-1 font-medium">
                      {c("휴지통", "Trash")}
                    </span>
                  </span>
                )}
              </nav>
              <div className="flex items-center gap-1">
                {/* Two views of one archive. The pair is a radiogroup rather
                    than two toggles so a screen reader hears one choice with
                    two options, which is what it is. */}
                <div
                  role="radiogroup"
                  aria-label={c("보기 방식", "View")}
                  className="inline-flex rounded-md border border-border p-0.5"
                >
                  {(
                    [
                      ["grid", LayoutGrid, c("그리드", "Grid")],
                      ["list", List, c("리스트", "List")],
                    ] as const
                  ).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      role="radio"
                      aria-checked={view === mode}
                      aria-label={label}
                      title={label}
                      onClick={() => chooseView(mode)}
                      className={`grid size-8 place-items-center rounded transition-colors ${
                        view === mode
                          ? "bg-surface-secondary text-foreground"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ))}
                </div>
                {/* Folders and the trash are a few times a week, not every
                    visit — one menu instead of two more buttons. */}
                {data.canEdit && !trash && (
                  <RowMenu label={c("아카이브 작업", "Archive actions")}>
                    <RowMenuItem
                      disabled={queue.busy}
                      onClick={() => setShowFolder(true)}
                    >
                      {c("새 폴더", "New folder")}
                    </RowMenuItem>
                    <RowMenuItem onClick={() => setTrash(true)}>
                      {c("휴지통", "Trash")}
                    </RowMenuItem>
                  </RowMenu>
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
                queue.enqueue(
                  resuming ? selected.slice(0, 1) : selected,
                  resuming,
                );
              }}
            />
            {!data.capabilities.uploadsEnabled && data.canEdit && (
              <Notice role="note">
                {c(
                  "이 환경에서는 새 업로드를 사용할 수 없습니다.",
                  "New uploads are disabled in this environment.",
                )}
              </Notice>
            )}
            {showFolder && data.canEdit && !trash && (
              <form
                className="flex flex-col gap-2 sm:flex-row"
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
                  placeholder={c("폴더 이름", "Folder name")}
                  required
                  autoFocus
                  maxLength={120}
                  className={`${inputClass} sm:max-w-xs`}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    className={primaryClass}
                    disabled={!!busy || !folderName.trim()}
                  >
                    {c("폴더 만들기", "Create folder")}
                  </button>
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() => {
                      setFolderName("");
                      setShowFolder(false);
                    }}
                  >
                    {c("취소", "Cancel")}
                  </button>
                </div>
              </form>
            )}
            <TransferPanel queue={queue} onCancel={cancelTransfer} />
            {editing && (
              <form
                className="space-y-3 rounded-lg border border-border p-4"
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted">
                      {c("파일 이름", "File name")}
                    </span>
                    <input
                      className={inputClass}
                      required
                      maxLength={255}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted">
                      {c("이동할 폴더", "Destination folder")}
                    </span>
                    <select
                      className={inputClass}
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
                </div>
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

            {files.length === 0 && subfolders.length === 0 ? (
              <EmptyState
                title={
                  trash
                    ? c("휴지통이 비어 있습니다", "Trash is empty")
                    : c("첫 원본을 올려보세요", "Upload your first original")
                }
                description={
                  trash
                    ? undefined
                    : data.canEdit
                      ? c(
                          "파일을 이 영역에 놓거나 원본 업로드를 선택하세요.",
                          "Drop files here or choose Upload originals.",
                        )
                      : c(
                          "아카이브에 원본이 추가되면 여기에 표시됩니다.",
                          "Originals added to this archive will appear here.",
                        )
                }
              />
            ) : view === "grid" ? (
              <AssetGrid
                folders={trash ? [] : subfolders}
                assets={files}
                posters={posters}
                onOpenFolder={(folder) => setPath([...path, folder])}
                onPreview={openPreview}
                handlers={handlers}
              />
            ) : (
              <AssetList
                folders={trash ? [] : subfolders}
                assets={files}
                sort={sort}
                onSort={(key) => setSort((prev) => nextSort(prev, key))}
                onOpenFolder={(folder) => setPath([...path, folder])}
                onPreview={openPreview}
                onFreeUpSpace={() => setTrash(true)}
                handlers={handlers}
              />
            )}

            {data.nextCursor && (
              <button
                className={secondaryClass}
                onClick={() => void loadMore()}
              >
                {c("더 불러오기", "Load more")}
              </button>
            )}
          </section>
          {/* Capacity is the page's footer, not its headline: it matters when
              it runs out, and the error says so then. The per-file limit sits
              with it — the only part of the old footnote a person acts on. */}
          <StorageMeter
            storage={data.storage}
            note={c(
              `파일당 최대 ${bytes(data.capabilities.maxFileBytes)}`,
              `Up to ${bytes(data.capabilities.maxFileBytes)} per file`,
            )}
          />
          {preview.isOpen && playable[previewIndex] && (
            <PreviewModal
              state={preview}
              workspaceId={id}
              assets={playable}
              index={previewIndex}
              onIndex={setPreviewIndex}
              onDownload={(asset) => void download(asset)}
              onPoster={(key, dataUrl) =>
                setPosters((prev) => new Map(prev).set(key, dataUrl))
              }
            />
          )}
        </>
      )}
    </TeamShell>
  );
}
