"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { File as FileIcon, FileCog, Film, FolderOpen, Trash2 } from "lucide-react";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { apiClient } from "@/lib/api/client";
import {
  b2bService,
  type Project,
  type TeamFileCapabilities,
  type TeamFileVersionList,
} from "@/lib/api/services/b2b.service";
import type { TeamFileTrashEntry, TeamFileVersion } from "@/lib/api/generated/b2b";
import { fileApi, fileError, type FileScope } from "@/lib/b2b-files/api";
import { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { FileDownloads } from "./file-downloads";
import { scopeKey } from "@/lib/b2b-files/store";
import { bytes } from "@/lib/workspaces/upload";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  ConfirmDialog,
  EmptyState,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { Badge, Button, numClass, SearchField, Toolbar, type Tone } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, formatDay } from "@/lib/format";
import { FileTransfers } from "./file-transfers";
import { B2bError, errorCode, useCopy, previewStateCopy, projectFrame, projectsDenial } from "./shared";

export function ProjectFiles({ projectId }: { projectId: string }) {
  const context = useWorkspace()!;
  const { id } = context.data.workspace,
    userId = context.data.currentUserId;
  const permitted =
    !!context.b2b?.enrolled && context.b2b.allowedActions.projects;
  const scope = useMemo<FileScope>(
    () => ({
      origin: new URL(apiClient.defaults.baseURL!).origin,
      userId: userId ?? "",
      workspaceId: id,
      projectId,
    }),
    [userId, id, projectId],
  );
  return permitted && userId ? (
    <FilesView key={scopeKey(scope)} scope={scope} />
  ) : (
    <B2bError code={projectsDenial(context.b2b) ?? "B2B_PROJECT_NOT_FOUND"} />
  );
}
function FilesView({ scope }: { scope: FileScope }) {
  const c = useCopy(),
    { lang } = useI18n(),
    api = useMemo(() => fileApi(scope), [scope]);
  const [data, setData] = useState<{
    project: Project;
    capabilities: TeamFileCapabilities;
    list: TeamFileVersionList;
  } | null>(null);
  const [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [cursor, setCursor] = useState<string>();
  const serial = useRef(0),
    readController = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const sequence = ++serial.current,
      controller = new AbortController();
    readController.current?.abort();
    readController.current = controller;
    try {
      const [project, capabilities, list] = await Promise.all([
        b2bService.project(scope.workspaceId, scope.projectId),
        api.capabilities(controller.signal),
        api.versions(search, cursor, controller.signal),
      ]);
      if (sequence !== serial.current) return;
      if (capabilities.currentUserId !== scope.userId)
        throw new Error("B2B_FILE_ACCOUNT_CHANGED");
      setData({ project: project.project, capabilities, list });
      setError("");
    } catch (e) {
      if (sequence !== serial.current) return;
      setData(null);
      setError(fileError(e));
    }
  }, [api, scope, search, cursor]);
  useEffect(() => {
    const sequence = serial,
      reader = readController;
    const start = window.setTimeout(() => void reload(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const interval = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      ++sequence.current;
      reader.current?.abort();
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  const downloads = useFileDownloads(scope, !!data, reload);
  const trash = useProjectTrash(scope, api, reload);
  const trashList = useOverlayState();
  if (error) return <B2bError code={error} retry={() => void reload()} />;
  if (!data) return <TeamLoading />;
  const { project, capabilities, list } = data;
  return (
    <TeamShell {...projectFrame(scope.workspaceId, project, c, lang)}>
      <FileTransfers
        scope={scope}
        capabilities={capabilities}
        versions={list.versions}
        changed={() => void reload()}
      />
      <FileDownloads downloads={downloads} />
      <section
        className="space-y-2"
        aria-label={c("보관된 자료", "Stored files")}
      >
        {/* The page's title is the project; this names the list in it. */}
        <Toolbar title={c("프로젝트 자료", "Project files")}>
          {(list.versions.length > 0 || search) && (
            // Enter searches; there is no separate button.
            <form
              className="w-full sm:w-auto"
              onSubmit={(e) => {
                e.preventDefault();
                setCursor(undefined);
                setSearch(query.trim());
              }}
            >
              <SearchField
                value={query}
                onChange={(value) => setQuery(value.slice(0, 100))}
                label={c("자료 이름 검색", "Search file names")}
                placeholder={c("자료 이름 검색", "Search file names")}
              />
            </form>
          )}
        </Toolbar>
        {!list.versions.length ? (
          <EmptyState
            icon={FolderOpen}
            title={
              search
                ? c("검색 결과가 없습니다.", "No matching files.")
                : c("아직 보관된 자료가 없습니다.", "No files yet.")
            }
          />
        ) : (
          <>
          <FileListHead />
          <ul>
            {list.versions.map((version) => (
              <li className={fileRowClass} key={version.id}>
                <VersionHeader
                  version={version}
                  action={
                    <span className="flex items-center gap-1">
                    {version.allowedActions.download && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={downloads.jobs.some(
                          (j) =>
                            j.record.versionId === version.id &&
                            ["checking", "receiving", "authorizing"].includes(
                              j.state,
                            ),
                        )}
                        onClick={() => void downloads.start(version)}
                      >
                        {c("원본 다운로드", "Download original")}
                      </Button>
                    )}
                    {version.allowedActions.unlink && version.referenceRevision !== null && (
                      <RowMenu label={c(`${version.assetName} 작업`, `Actions for ${version.assetName}`)}>
                        <RowMenuItem tone="danger" disabled={trash.busy} onClick={() => trash.ask(version)}>
                          {c("삭제", "Delete")}
                        </RowMenuItem>
                      </RowMenu>
                    )}
                    </span>
                  }
                />
                {/* A file row is the file and its download (2026-10-08):
                    per-file permissions, cross-project links and stewards
                    left the web; the project decides who sees what. */}
              </li>
            ))}
          </ul>
          </>
        )}
        {(cursor || list.nextCursor) && (
          <div className="flex flex-wrap gap-2 pt-2">
            {cursor && (
              <Button variant="secondary" size="sm" onClick={() => setCursor(undefined)}>
                {c("처음 목록", "First page")}
              </Button>
            )}
            {list.nextCursor && (
              <Button variant="secondary" size="sm" onClick={() => setCursor(list.nextCursor!)}>
                {c("다음 목록", "Next page")}
              </Button>
            )}
          </div>
        )}
      </section>
      {trash.error && <B2bError code={trash.error} />}
      {trash.entries.length > 0 && (
        <Button variant="ghost" size="sm" className="-ml-2.5 text-muted" onClick={trashList.open}>
          <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
          {c(`최근 삭제한 파일 ${trash.entries.length}`, `Recently deleted ${trash.entries.length}`)}
        </Button>
      )}
      {trash.entries.length > 0 && (
        <Dialog state={trashList} title={c("최근 삭제한 파일", "Recently deleted")}>
          <ul className="divide-y divide-border text-foreground" aria-label={c("최근 삭제한 파일", "Recently deleted")}>
            {trash.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">{entry.version.assetName}</p>
                  <p className="text-xs text-muted tabular-nums">
                    {c(
                      `${formatDay(entry.restoreUntil, lang)}까지 복원할 수 있습니다`,
                      `Restorable until ${formatDay(entry.restoreUntil, lang)}`,
                    )}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={trash.busy}
                  onClick={() =>
                    void trash.restore(entry).then(() => {
                      // The last one back: nothing left to show.
                      if (trash.entries.length <= 1) trashList.close();
                    })
                  }
                >
                  {c("복원", "Restore")}
                </Button>
              </li>
            ))}
          </ul>
        </Dialog>
      )}
      {trash.asking && (
        <ConfirmDialog
          label={c("파일 삭제", "Delete file")}
          onClose={() => {
            if (!trash.busy) trash.ask(null);
          }}
        >
          <p className="break-all text-sm font-medium">{trash.asking.assetName}</p>
          <p className="text-sm text-muted">
            {trash.asking.allowedActions.manage
              ? c(
                  "휴지통으로 옮깁니다. 30일 안에는 이 화면 아래 '최근 삭제한 파일'에서 복원할 수 있고, 그 뒤 완전히 지워집니다.",
                  "It moves to the trash. Restore it from 'Recently deleted' below within 30 days; after that it is gone for good.",
                )
              : c(
                  "이 프로젝트에서 뺍니다. 파일을 올린 사람의 보관 공간에는 남습니다.",
                  "It leaves this project. It stays with the person who uploaded it.",
                )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" aria-busy={trash.busy} disabled={trash.busy} onClick={() => void trash.remove()}>
              {trash.busy ? c("삭제하는 중…", "Deleting…") : c("삭제", "Delete")}
            </Button>
            <Button variant="secondary" disabled={trash.busy} onClick={() => trash.ask(null)}>
              {c("취소", "Cancel")}
            </Button>
          </div>
        </ConfirmDialog>
      )}
    </TeamShell>
  );
}

/**
 * Delete and restore, the Figma way (2026-10-08): a file leaves the project
 * and, when you uploaded it, waits 30 days in the trash, listed here with a
 * 복원. The server keeps these as two steps each (unlink then trash, restore
 * then link back), so a failure between them leaves the first done; the
 * reread shows where the file is.
 */
function useProjectTrash(
  scope: FileScope,
  api: ReturnType<typeof fileApi>,
  reload: () => Promise<void>,
) {
  const [entries, setEntries] = useState<TeamFileTrashEntry[]>([]);
  const [asking, ask] = useState<TeamFileVersion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const list = await api.trashList();
      setEntries(
        list.entries.filter(
          (e) => e.state === "recoverable" && e.allowedActions.restore && e.version.projectId === scope.projectId,
        ),
      );
    } catch {
      setEntries([]);
    }
  }, [api, scope.projectId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
      await reload();
      await load();
    }
  };
  return {
    entries,
    asking,
    ask,
    busy,
    error,
    remove: () =>
      run(async () => {
        const version = asking;
        if (!version || version.referenceRevision === null) return;
        await api.unlink(version.id, {
          requestKey: crypto.randomUUID(),
          revision: version.referenceRevision,
          reason: "파일 삭제",
        });
        // Only the uploader holds the file itself; a lead's delete is the unlink.
        if (version.allowedActions.manage)
          await api.trash({
            requestKey: crypto.randomUUID(),
            versionId: version.id,
            revision: version.assetRevision,
            reason: "파일 삭제",
            fromLibrary: true,
            sourceProjectId: scope.projectId,
          });
        ask(null);
      }),
    restore: (entry: TeamFileTrashEntry) =>
      run(async () => {
        await api.restore(entry.id, {
          requestKey: crypto.randomUUID(),
          revision: entry.revision,
          reason: "파일 복원",
          fromLibrary: true,
          sourceProjectId: scope.projectId,
        });
        // Back into the project it left (its original source).
        await api.link({
          requestKey: crypto.randomUUID(),
          versionId: entry.version.id,
          fromLibrary: true,
          sourceProjectId: scope.projectId,
        });
      }),
  };
}

type Copy = (ko: string, en: string) => string;
const kinds: Record<TeamFileVersion["kind"], [string, string]> = {
  original: ["원본", "Original"],
  output: ["결과물", "Output"],
  working: ["작업 자료", "Working files"],
};

/**
 * The head of a stored version's row, shared by 프로젝트 자료 and 보관함 so the
 * same version reads the same in both: a 36px kind tile, its series name as
 * the heading with "file · version · date" under it, the size, the preview
 * state and the row's actions.
 */
export function VersionHeader({
  version,
  action,
}: {
  version: TeamFileVersion;
  action?: ReactNode;
}) {
  const c = useCopy();
  const { lang } = useI18n();
  const Icon = version.kind === "output" ? Film : version.kind === "working" ? FileCog : FileIcon;
  return (
    <div className={fileGrid}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-medium">{version.assetName}</h2>
          <p className="truncate text-xs text-muted tabular-nums">
            {version.name} · {c("버전", "Version")} {version.ordinal} · {formatDate(version.createdAt, lang)}
            <span className="md:hidden">
              {" "}· {bytes(version.size)} · {c(...kinds[version.kind])}
            </span>
          </p>
        </div>
      </div>
      <p className={`hidden text-[13px] text-muted md:block ${numClass}`}>
        {bytes(version.size)} · {c(...kinds[version.kind])}
      </p>
      <span aria-live="polite" className="hidden md:block">
        <Badge tone={previewTone[version.previewState]}>
          {previewStateCopy(version.previewState, c)}
        </Badge>
      </span>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

/** A preview that failed is the one state worth colour; the rest are facts. */
const previewTone: Record<TeamFileVersion["previewState"], Tone> = {
  not_requested: "neutral",
  pending: "neutral",
  processing: "neutral",
  ready: "neutral",
  failed: "danger",
};

/** One grid for the file list's head and every row, so they line up like a
 * table while each row stays a list item (its heading and menu inside it).
 * The last column fits 원본 다운로드 and the menu on one line. */
const fileGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[minmax(0,1fr)_8rem_10rem_12rem]";
/** Actions and details under a row line up with the file name, not the icon. */
export const fileRowClass = "space-y-1.5 border-b border-border py-2.5 md:[&>*:not(:first-child)]:pl-12";

export function FileListHead() {
  const c = useCopy();
  return (
    <div aria-hidden="true" className={`${fileGrid} hidden h-10 border-b border-border text-xs font-medium text-muted md:grid`}>
      <span>{c("이름", "Name")}</span>
      <span className="text-right">{c("크기·종류", "Size · kind")}</span>
      <span>{c("미리보기", "Preview")}</span>
      <span />
    </div>
  );
}

/** Container, duration and hash: what 버전 상세 lists for any version. */
export function versionFacts(
  version: TeamFileVersion,
  c: Copy,
): [ReactNode, ReactNode][] {
  return [
    [
      c("형식", "Format"),
      `${version.metadata.container} · ${
        version.metadata.durationMs === null
          ? c("길이 정보 없음", "Duration unavailable")
          : `${(version.metadata.durationMs / 1000).toLocaleString()} ${c("초", "s")}`
      }`,
    ],
    [
      "SHA-256",
      <span key="sha" className="break-all font-mono text-xs">
        {version.sha256}
      </span>,
    ],
  ];
}
