"use client";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  FolderPlus,
  LayoutGrid,
  List,
  Search,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { Dialog } from "@/components/dialog";
import {
  cloudService,
  type Asset,
  type ArchiveDetail,
  type Folder,
  type StorageUsage,
} from "@/lib/api/services/cloud.service";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { useI18n } from "@/lib/i18n/context";
import { bytes } from "@/lib/workspaces/upload";
import { contentGone } from "@/lib/workspaces/errors";
import { type Transfer } from "@/lib/workspaces/queue";
import { useUploadQueue } from "@/lib/workspaces/use-upload-queue";
import { dropEntries, folderPaths, pathKey, readDrop } from "@/lib/workspaces/drop";
import {
  isPlayable,
  nextSort,
  sortAssets,
  type ArchiveSort,
  type ArchiveView,
} from "@/lib/workspaces/archive-view";
import { posterKey, readDurations, readPosters } from "@/lib/workspaces/poster-cache";
import { useAutoPosters } from "@/lib/workspaces/auto-poster";
import { buildAppOpenUrl } from "@/lib/workspaces/app-link";
import {
  TeamShell,
  SpaceBadge,
  TeamLoading,
  ConfirmDialog,
} from "@/components/workspaces/shared";
import {
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  MeterRow,
  Notice,
  SearchField,
  Segmented,
  Select,
  Toolbar,
} from "@/components/ui";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { CloudError, cloudErrorCode } from "@/components/workspaces/cloud-shared";
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
  const folderDialog = useOverlayState();
  const editDialog = useOverlayState();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  // The folder tile or row a drag is over, if any: the drop lands there.
  const [dropOver, setDropOver] = useState<string | null>(null);
  // Where an in-app link would have gone while uploads still run.
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const leaveDialog = useOverlayState({
    isOpen: !!leaveTo,
    onOpenChange: (open) => !open && setLeaveTo(null),
  });
  const router = useRouter();
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

  // Only the newest list request may paint: opening folder A then B quickly
  // must never show A's files under B's breadcrumb.
  const loads = useRef(0);
  const loadFailed = useRef(false);
  const load = useCallback(async () => {
    const mine = ++loads.current;
    try {
      // The trash is its own listing: the folder list never carries trashed files.
      const next = await cloudService.archive(id, { folderId, trashed: trash });
      if (alive.current && mine === loads.current) {
        setData(next);
        if (loadFailed.current) {
          loadFailed.current = false;
          setError("");
        }
        // Every role uploads, so the "which space am I in" stamp cannot depend
        // on being a manager. A failed detail costs the stamp, not the page.
        setTeam(await workspaceService.detail(id).catch(() => null));
      }
    } catch (e) {
      if (alive.current && mine === loads.current) {
        const code = cloudErrorCode(e);
        loadFailed.current = true;
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
  }, [id, folderId, trash]);

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
    const before = loads.current;
    try {
      const more = await cloudService.archive(id, { folderId, cursor, trashed: trash });
      // A reload (another folder, a poll) since then owns the list now.
      if (alive.current && before === loads.current)
        setData((prev) =>
          prev ? { ...more, assets: [...prev.assets, ...more.assets] } : more,
        );
    } catch (e) {
      if (alive.current) setError(cloudErrorCode(e));
    } finally {
      if (alive.current) setBusy("");
    }
  }

  // The signed URL answers `Content-Disposition: attachment`, so following it
  // downloads in place; the page never navigates away.
  async function startDownload(asset: Asset) {
    const result = await cloudService.download(id, asset.id);
    const link = document.createElement("a");
    link.href = result.url;
    link.rel = "noopener noreferrer";
    link.download = result.name;
    document.body.append(link);
    link.click();
    link.remove();
  }
  async function download(asset: Asset) {
    if (busy) return;
    setBusy(asset.id);
    setError("");
    try {
      await startDownload(asset);
      setNotice(c("원본 다운로드를 시작했습니다.", "Original download started."));
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy("");
    }
  }
  /**
   * One file after another, each with a fresh 60-second URL. Back-to-back
   * download navigations get dropped by browsers, so they are spaced; the
   * first time, the browser asks once to allow several downloads.
   */
  async function downloadMany(assets: Asset[]) {
    if (busy || !assets.length) return;
    setBusy("bulk");
    setError("");
    let failed = 0;
    for (const [i, asset] of assets.entries()) {
      setNotice(c(`다운로드 ${i + 1}/${assets.length}`, `Downloading ${i + 1} of ${assets.length}`));
      try {
        await startDownload(asset);
      } catch {
        failed++;
      }
      if (i < assets.length - 1) await new Promise((done) => setTimeout(done, 800));
    }
    if (!alive.current) return;
    setBusy("");
    setNotice(
      failed
        ? c(
            `${assets.length - failed}개 다운로드를 시작했고 ${failed}개는 실패했습니다.`,
            `Started ${assets.length - failed} downloads; ${failed} failed.`,
          )
        : c(
            `${assets.length}개 다운로드를 시작했습니다. 브라우저가 여러 파일 다운로드를 물으면 허용해 주세요.`,
            `Started ${assets.length} downloads. If the browser asks about multiple downloads, allow it.`,
          ),
    );
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
  const needle = query.trim().toLowerCase();
  const subfolders =
    data?.folders.filter(
      (f) => f.parentId === (folderId ?? null) && (!needle || f.name.toLowerCase().includes(needle)),
    ) ?? [];
  const files = useMemo(
    () =>
      sortAssets(
        (data?.assets ?? []).filter(
          (a) =>
            (trash ? !!a.trashedAt : !a.trashedAt) &&
            (!needle || a.name.toLowerCase().includes(needle)),
        ),
        sort,
      ),
    [data?.assets, trash, sort, needle],
  );
  const canUpload =
    !!data?.canEdit && !!data.capabilities.uploadsEnabled && !trash;
  /**
   * What a drop carried, uploaded with its folders: a dropped folder becomes
   * a folder here (sub-folders too), and each file lands in its own. `target`
   * is the folder the drop was on — the open one, or a folder tile.
   */
  async function uploadDrop(entries: (FileSystemEntry | File)[], target: string | undefined) {
    let dropped;
    try {
      dropped = await readDrop(entries);
    } catch {
      setError("UPLOAD_DROP_UNREADABLE");
      return;
    }
    if (!alive.current || !dropped.length) return;
    const made = new Map<string, string | undefined>([[pathKey([]), target]]);
    const paths = folderPaths(dropped);
    if (paths.length) {
      setNotice(c("폴더를 만드는 중…", "Creating folders…"));
      try {
        for (const path of paths)
          made.set(
            pathKey(path),
            (await cloudService.folder(id, path[path.length - 1], made.get(pathKey(path.slice(0, -1))))).id,
          );
      } catch (e) {
        setNotice("");
        setError(cloudErrorCode(e));
        return;
      }
      void load();
    }
    const groups = new Map<string, File[]>();
    for (const { file, path } of dropped) groups.set(pathKey(path), [...(groups.get(pathKey(path)) ?? []), file]);
    for (const [key, group] of groups) queue.enqueue(group, { folderId: made.get(key) });
  }
  const cannotUpload = trash
    ? c("휴지통에는 올릴 수 없습니다. 모든 파일로 돌아가 올려 주세요.", "You can't upload into the trash. Go back to All files.")
    : c("이 아카이브에 올릴 권한이 없습니다.", "You can't upload to this archive.");
  // The window listener is bound once; what a drop does follows each render.
  const onPageDrop = useRef<(data: DataTransfer) => void>(() => {});
  useEffect(() => {
    onPageDrop.current = (dropped) => {
      if (!canUpload) return setNotice(cannotUpload);
      void uploadDrop(dropEntries(dropped), folderId);
    };
  });
  const allowDrop = useRef(false);
  useEffect(() => {
    allowDrop.current = canUpload;
  }, [canUpload]);
  /**
   * Drop anywhere on the page (Frame.io, Drive). Every file drag is caught,
   * even where nothing may be uploaded — otherwise the browser opens the file
   * and the archive is gone. The overlay hides a beat after the last
   * `dragover` (they fire every ~50 ms while a drag is over the page), which
   * no enter/leave count can get stuck on.
   */
  const ready = !!data;
  useEffect(() => {
    if (!ready) return;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const end = () => {
      clearTimeout(idle);
      setDragging(false);
      setDropOver(null);
    };
    const over = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = allowDrop.current ? "copy" : "none";
      setDragging(allowDrop.current);
      clearTimeout(idle);
      idle = setTimeout(end, 200);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      end();
      if (e.dataTransfer) onPageDrop.current(e.dataTransfer);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      end();
    };
  }, [ready]);

  /**
   * Picked files, for downloading or trashing several at once. A pick belongs
   * to the folder (or trash) it was made in, and only counts files on screen.
   */
  const scope = `${folderId ?? ""}:${trash}`;
  const [picks, setPicks] = useState<{ scope: string; ids: Set<string> }>({ scope, ids: new Set() });
  const anchor = useRef<string | null>(null);
  const selected = useMemo(
    () => new Set(picks.scope === scope ? files.filter((a) => picks.ids.has(a.id)).map((a) => a.id) : []),
    [picks, scope, files],
  );
  const pick = (ids: Set<string>) => setPicks({ scope, ids });
  function onSelect(asset: Asset, range: boolean) {
    const next = new Set(selected);
    const from = range && anchor.current ? files.findIndex((a) => a.id === anchor.current) : -1;
    const to = files.findIndex((a) => a.id === asset.id);
    if (from >= 0 && to >= 0)
      for (const a of files.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(a.id);
    else if (next.has(asset.id)) next.delete(asset.id);
    else next.add(asset.id);
    anchor.current = asset.id;
    pick(next);
  }
  const picking = selected.size > 0;
  useEffect(() => {
    if (!picking) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicks((prev) => ({ ...prev, ids: new Set() }));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [picking]);
  const pickedFiles = files.filter((a) => selected.has(a.id));
  const usable = (a: Asset) => a.state === "ready" && new Date(a.expiresAt).getTime() > now;
  const downloadable = data?.canDownload ? pickedFiles.filter((a) => !a.trashedAt && usable(a)) : [];
  const trashable = data?.canEdit && !trash ? pickedFiles.filter((a) => a.state === "ready") : [];
  const restorable = data?.canEdit && trash ? pickedFiles.filter(usable) : [];

  /**
   * Leaving mid-upload. The queue lives on this page, so an in-app link would
   * stop it without a word (a reload already asks, via beforeunload). Links
   * are caught before Next's router sees them and asked about first.
   */
  const uploading = queue.busy;
  useEffect(() => {
    if (!uploading) return;
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, location.href);
      if (to.origin !== location.origin || to.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(to.pathname + to.search + to.hash);
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, [uploading]);

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
  const [durations, setDurations] = useState<Map<string, number>>(new Map());
  // Both views show thumbnails (2026-10-08). The ones this browser already
  // has come first; only then are the missing ones made, so a cached poster
  // is never fetched again.
  const [postersRead, setPostersRead] = useState<Asset[] | null>(null);
  useEffect(() => {
    if (!files.length) return;
    let live = true;
    const keys = files.map((asset) => posterKey(asset));
    void Promise.all([readPosters(keys), readDurations(keys)]).then(([found, lengths]) => {
      if (!live) return;
      if (found.size) setPosters((prev) => new Map([...prev, ...found]));
      if (lengths.size) setDurations((prev) => new Map([...prev, ...lengths]));
      setPostersRead(files);
    });
    return () => {
      live = false;
    };
  }, [files]);
  useAutoPosters({
    workspaceId: id,
    assets: files,
    posters,
    enabled: !trash && !!data?.canDownload && postersRead === files,
    onPoster: (key, dataUrl, duration) => {
      setPosters((prev) => new Map(prev).set(key, dataUrl));
      if (duration) setDurations((prev) => new Map(prev).set(key, duration));
    },
  });

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
      editDialog.open();
    },
    onResume: (asset) => {
      resume.current = asset;
      fileInput.current?.click();
    },
    onAction: (key, run) => void action(key, run),
    onConfirm: (label, run) => setConfirm({ label, run }),
    selected,
    onSelect,
    folderDrop: canUpload
      ? {
          over: dropOver,
          onOver: setDropOver,
          onDrop: (folder, dropped) => {
            setDragging(false);
            setDropOver(null);
            void uploadDrop(dropEntries(dropped), folder);
          },
        }
      : null,
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
  const here = trash ? c("휴지통", "Trash") : current?.name ?? c("모든 파일", "All files");
  const empty = files.length === 0 && subfolders.length === 0;
  const sortValue = `${sort.key}:${sort.dir}`;

  return (
    <TeamShell
      title={c("콘텐츠 아카이브", "Content archive")}
      /*
        Upload is the durable action on this page, so the space it lands in is
        named beside the page's own title, not only in the switcher.
      */
      badge={team && <SpaceBadge workspace={team.workspace} />}
      actions={
        data && (
          <>
            {data.canEdit && !trash && (
              <Button variant="secondary" disabled={queue.busy} onClick={folderDialog.open}>
                <FolderPlus size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("새 폴더", "New folder")}
              </Button>
            )}
            {data.canEdit && !trash && (
              <Button
                disabled={!canUpload}
                onClick={() => {
                  resume.current = undefined;
                  fileInput.current?.click();
                }}
              >
                <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("업로드", "Upload")}
              </Button>
            )}
            {/* Rare doors, one menu: the app, and the trash. */}
            <RowMenu label={c("콘텐츠 아카이브 작업", "Content archive actions")}>
              {appLink && <RowMenuItem onClick={openInApp}>{c("앱에서 열기", "Open in app")}</RowMenuItem>}
              {data.canEdit && !trash && (
                <RowMenuItem onClick={() => setTrash(true)}>{c("휴지통", "Trash")}</RowMenuItem>
              )}
            </RowMenu>
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
            <Button
              disabled={!!busy}
              aria-busy={busy === "confirm"}
              onClick={() => {
                void action("confirm", confirm.run).then(() =>
                  setConfirm(null),
                );
              }}
            >
              {c("확인", "Confirm")}
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => setConfirm(null)}
            >
              {c("돌아가기", "Go back")}
            </Button>
          </div>
        </ConfirmDialog>
      )}
      {data && handlers && (
        <>
          {/* Capacity first (2026-10-08): how full the archive is frames
              everything below it, like a drive's quota card. */}
          <ArchiveStorage
            storage={data.storage}
            note={c(
              `파일당 최대 ${bytes(data.capabilities.maxFileBytes)}`,
              `Up to ${bytes(data.capabilities.maxFileBytes)} per file`,
            )}
          />
          <section className="space-y-4">
            {/* The way back up, once there is somewhere above this. */}
            {(current || trash) && (
              <nav
                aria-label={c("폴더 경로", "Folder path")}
                className="-mb-2 flex min-w-0 flex-wrap items-center gap-1 text-[13px]"
              >
                <button
                  className={crumb}
                  onClick={() => {
                    setTrash(false);
                    setPath([]);
                  }}
                >
                  {c("모든 파일", "All files")}
                </button>
                {path.map((folder, i) =>
                  !trash && i === path.length - 1 ? (
                    <span key={folder.id} className="flex min-w-0 items-center gap-1">
                      {chevron}
                      <span aria-current="page" className="max-w-60 truncate px-1.5 py-1 font-medium">
                        {folder.name}
                      </span>
                    </span>
                  ) : (
                    <span key={folder.id} className="flex min-w-0 items-center gap-1">
                      {chevron}
                      <button
                        className={`${crumb} max-w-60 truncate`}
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
            )}
            {/* One line: where you are and how much is here, then how you
                look at it (Drive, Frame.io). */}
            <Toolbar title={here} count={files.length}>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder={c("이 폴더에서 검색", "Search this folder")}
                label={c("파일 검색", "Search files")}
                className="sm:w-56"
              />
              <Select
                aria-label={c("정렬", "Sort")}
                size="sm"
                wrapperClassName="w-36"
                value={sortValue}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":") as [ArchiveSort["key"], ArchiveSort["dir"]];
                  setSort({ key, dir });
                }}
              >
                <option value="createdAt:desc">{c("최근 올린 순", "Newest first")}</option>
                <option value="createdAt:asc">{c("오래된 순", "Oldest first")}</option>
                <option value="name:asc">{c("이름 순", "Name A–Z")}</option>
                <option value="size:desc">{c("큰 파일 순", "Largest first")}</option>
              </Select>
              {/* Two views of one archive. A radiogroup rather than two
                  toggles, so a screen reader hears one choice with two
                  options, which is what it is. */}
              <Segmented
                label={c("보기 방식", "View")}
                iconOnly
                value={view}
                onChange={chooseView}
                options={[
                  { value: "grid", label: c("그리드", "Grid"), icon: LayoutGrid },
                  { value: "list", label: c("리스트", "List"), icon: List },
                ]}
              />
            </Toolbar>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                e.target.value = "";
                const resuming = resume.current;
                resume.current = undefined;
                queue.enqueue(resuming ? chosen.slice(0, 1) : chosen, { resuming });
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
            {trash && (
              <Notice>
                {c(
                  "휴지통의 파일은 보관 기한이 지나면 영구 삭제됩니다. 그 전에는 복구할 수 있습니다.",
                  "Files in the trash are deleted for good when their retention ends. Restore them before that.",
                )}
              </Notice>
            )}

            {picking && (
              // Sticky, so a long list keeps its actions in reach.
              <div
                role="region"
                aria-label={c("선택한 파일", "Selected files")}
                className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-overlay px-3 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
              >
                <p className="mr-auto text-[13px] font-medium tabular-nums">
                  {c(`${selected.size}개 선택`, `${selected.size} selected`)}
                </p>
                {downloadable.length > 0 && (
                  <Button size="sm" variant="secondary" disabled={!!busy} aria-busy={busy === "bulk"} onClick={() => void downloadMany(downloadable)}>
                    <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                    {c(`다운로드 ${downloadable.length}`, `Download ${downloadable.length}`)}
                  </Button>
                )}
                {trashable.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      setConfirm({
                        label: c(
                          `${trashable.length}개 파일을 휴지통으로 옮길까요? 팀원의 다운로드가 중단됩니다.`,
                          `Move ${trashable.length} files to trash? Team members will no longer be able to download them.`,
                        ),
                        run: async () => {
                          for (const a of trashable) await cloudService.update(id, a.id, { trashed: true });
                          pick(new Set());
                        },
                      })
                    }
                  >
                    <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
                    {c("휴지통으로", "Move to trash")}
                  </Button>
                )}
                {restorable.length > 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() =>
                      void action("bulk", async () => {
                        for (const a of restorable) await cloudService.update(id, a.id, { trashed: false });
                        pick(new Set());
                      })
                    }
                  >
                    {c(`복구 ${restorable.length}`, `Restore ${restorable.length}`)}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => pick(new Set())}>
                  <X size={14} strokeWidth={1.75} aria-hidden="true" />
                  {c("선택 해제", "Clear")}
                </Button>
              </div>
            )}
            {empty ? (
              needle ? (
                <EmptyState
                  icon={Search}
                  title={c(`'${query.trim()}'와 맞는 파일이 없습니다.`, `Nothing matches '${query.trim()}'.`)}
                />
              ) : trash ? (
                <EmptyState icon={Trash2} title={c("휴지통이 비어 있습니다.", "Trash is empty.")} />
              ) : (
                <EmptyState
                  frame="dashed"
                  icon={UploadCloud}
                  className="py-16"
                  title={c("첫 원본을 올려보세요", "Upload your first original")}
                  description={
                    data.canEdit
                      ? c("파일을 이 화면 아무 곳에나 끌어다 놓거나 업로드를 누르세요.", "Drop files anywhere on this page, or choose Upload.")
                      : c("콘텐츠 아카이브에 원본이 추가되면 여기에 표시됩니다.", "Originals added to this archive will appear here.")
                  }
                  action={
                    canUpload && (
                      <Button
                        onClick={() => {
                          resume.current = undefined;
                          fileInput.current?.click();
                        }}
                      >
                        <Upload size={16} strokeWidth={1.75} aria-hidden="true" />
                        {c("업로드", "Upload")}
                      </Button>
                    )
                  }
                />
              )
            ) : view === "grid" ? (
              <AssetGrid
                folders={trash ? [] : subfolders}
                assets={files}
                posters={posters}
                durations={durations}
                onOpenFolder={(folder) => setPath([...path, folder])}
                onPreview={openPreview}
                handlers={handlers}
              />
            ) : (
              <AssetList
                folders={trash ? [] : subfolders}
                assets={files}
                posters={posters}
                durations={durations}
                sort={sort}
                onSort={(key) => setSort((prev) => nextSort(prev, key))}
                onOpenFolder={(folder) => setPath([...path, folder])}
                onPreview={openPreview}
                onFreeUpSpace={() => setTrash(true)}
                onSelectAll={() => pick(new Set(selected.size === files.length ? [] : files.map((a) => a.id)))}
                handlers={handlers}
              />
            )}

            {data.nextCursor && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  aria-busy={busy === "more"}
                  onClick={() => void loadMore()}
                >
                  {c("더 불러오기", "Load more")}
                </Button>
              </div>
            )}
          </section>
          <TransferPanel queue={queue} onCancel={cancelTransfer} />
          {dragging && (
            // An outline and a label, not a veil: the folder tiles under it
            // are drop targets and have to stay visible.
            <div className="pointer-events-none fixed inset-2 z-50 rounded-xl border-2 border-dashed border-foreground/50">
              <p
                role="status"
                className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg"
              >
                <UploadCloud size={16} strokeWidth={1.75} aria-hidden="true" />
                {(() => {
                  const into = (dropOver && subfolders.find((f) => f.id === dropOver)?.name) || here;
                  return c(`'${into}'에 놓아서 업로드`, `Drop to upload to '${into}'`);
                })()}
              </p>
            </div>
          )}
          <Dialog state={leaveDialog} title={c("업로드를 멈추고 이동할까요?", "Stop uploading and leave?")}>
            <div className="space-y-4">
              <p className="text-sm leading-6">
                {c(
                  "아직 올리는 중인 파일이 있습니다. 이동하면 남은 업로드가 멈추고, 나중에 같은 파일을 골라 이어 올릴 수 있습니다.",
                  "Files are still uploading. Leaving stops them; you can resume later by choosing the same files.",
                )}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setLeaveTo(null)}>
                  {c("계속 올리기", "Keep uploading")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    queue.abortAll();
                    if (leaveTo) router.push(leaveTo);
                  }}
                >
                  {c("멈추고 이동", "Stop and leave")}
                </Button>
              </div>
            </div>
          </Dialog>
          <Dialog state={folderDialog} title={c("새 폴더", "New folder")}>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void action("folder", async () => {
                  await cloudService.folder(id, folderName, folderId);
                  setFolderName("");
                  folderDialog.close();
                });
              }}
            >
              <input
                aria-label={c("폴더 이름", "Folder name")}
                placeholder={c("폴더 이름", "Folder name")}
                required
                autoFocus
                maxLength={120}
                className={inputClass}
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={folderDialog.close}>
                  {c("취소", "Cancel")}
                </Button>
                <Button type="submit" disabled={!!busy || !folderName.trim()}>
                  {c("폴더 만들기", "Create folder")}
                </Button>
              </div>
            </form>
          </Dialog>
          <Dialog state={editDialog} title={c("이름과 위치", "Name and location")}>
            {editing && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("edit", async () => {
                    await cloudService.update(id, editing.id, {
                      name: editName,
                      folderId: editFolder || null,
                    });
                    setEditing(null);
                    editDialog.close();
                  });
                }}
              >
                <Field label={c("파일 이름", "File name")} htmlFor="archive-edit-name">
                  <input
                    id="archive-edit-name"
                    className={inputClass}
                    required
                    maxLength={255}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </Field>
                <Field label={c("폴더", "Folder")} htmlFor="archive-edit-folder">
                  <Select
                    id="archive-edit-folder"
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                  >
                    <option value="">{c("모든 파일", "All files")}</option>
                    {data.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={editDialog.close}>
                    {c("취소", "Cancel")}
                  </Button>
                  <Button type="submit" disabled={!!busy}>
                    {c("변경 저장", "Save changes")}
                  </Button>
                </div>
              </form>
            )}
          </Dialog>
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

/**
 * How full the archive is, as one kit meter row. The numbers are the old
 * StorageMeter's — what is stored plus what in-flight uploads have reserved.
 */
function ArchiveStorage({ storage, note }: { storage: StorageUsage; note: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const total = storage.used + storage.reserved;
  const free = Math.max(0, storage.limit - total);
  const share = storage.limit > 0 ? total / storage.limit : 0;
  const percent =
    total > 0 && share < 0.001
      ? c("0.1% 미만", "under 0.1%")
      : `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
  const facts = [
    c(`${percent} 사용`, `${percent} used`),
    c(`${bytes(free)} 남음`, `${bytes(free)} left`),
    storage.reserved > 0 ? c(`업로드 중 ${bytes(storage.reserved)}`, `Uploading ${bytes(storage.reserved)}`) : null,
    note,
  ];
  return (
    <section aria-label={c("저장 공간", "Storage")}>
      <Card>
        <MeterRow
          label={c("저장 공간", "Storage")}
          value={`${bytes(total)} / ${bytes(storage.limit)}`}
          percent={share * 100}
          foot={facts.filter(Boolean).join(" · ")}
        />
        {share >= 0.95 && (
          <p className="mt-3 text-xs leading-5 text-danger-ink">
            {c(
              "저장 공간이 거의 찼습니다. 휴지통을 비우거나 플랜에서 용량을 늘려 주세요.",
              "Storage is nearly full. Empty the trash or add capacity on your plan.",
            )}
          </p>
        )}
      </Card>
    </section>
  );
}
