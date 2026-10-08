"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { File as FileIcon, FileCog, Film } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import {
  b2bService,
  type Project,
  type TeamFileCapabilities,
  type TeamFileVersionList,
} from "@/lib/api/services/b2b.service";
import type { TeamFileVersion } from "@/lib/api/generated/b2b";
import { fileApi, fileError, type FileScope } from "@/lib/b2b-files/api";
import { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { FileDownloads } from "./file-downloads";
import { TransferSteward, VersionAddress } from "./file-stewards";
import { scopeKey } from "@/lib/b2b-files/store";
import { bytes } from "@/lib/workspaces/upload";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Details,
  EmptyState,
  inputClass,
  KeyValues,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { FileTransfers } from "./file-transfers";
import { folderTabs, B2bError, useCopy, previewStateCopy, projectsDenial } from "./shared";
import { useFileOperations } from "@/lib/b2b-files/use-operations";
import {
  FileManager,
  PendingFileOperations,
  textAction,
  type FileManagementMode,
} from "./file-management";

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
  const [management, setManagement] = useState<{
    versionId: string;
    mode: FileManagementMode;
  } | null>(null);
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
  const operations = useFileOperations(scope, !!data, reload);
  const downloads = useFileDownloads(scope, !!data, reload);
  if (error) return <B2bError code={error} retry={() => void reload()} />;
  if (!data) return <TeamLoading />;
  const { project, capabilities, list } = data;
  const managedVersion = list.versions.find(
    (v) => v.id === management?.versionId,
  );
  return (
    <TeamShell
      title={c("프로젝트 자료", "Project files")}
      description={project.name}
      tabs={folderTabs(scope.workspaceId, project, c)}
    >
      <FileTransfers
        scope={scope}
        capabilities={capabilities}
        versions={list.versions}
        changed={() => void reload()}
      />
      <FileDownloads downloads={downloads} />
      <PendingFileOperations operations={operations} />
      {management &&
        managedVersion &&
        (management.mode === "unlink"
          ? managedVersion.allowedActions.unlink
          : managedVersion.allowedActions.manage) && (
          <FileManager
            key={`${managedVersion.id}:${management.mode}`}
            scope={scope}
            version={managedVersion}
            mode={management.mode}
            operations={operations}
            close={() => setManagement(null)}
          />
        )}
      <section
        className="space-y-4"
        aria-label={c("보관된 자료", "Stored files")}
      >
        {(list.versions.length > 0 || search) && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setCursor(undefined);
              setSearch(query.trim());
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">
                {c("자료 이름 검색", "Search file names")}
              </span>
              <input
                className={inputClass}
                value={query}
                maxLength={100}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={c("자료 이름 검색", "Search file names")}
              />
            </label>
            <button type="submit" className={secondaryClass}>
              {c("검색", "Search")}
            </button>
          </form>
        )}
        {!list.versions.length ? (
          <EmptyState
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
                    version.allowedActions.download && (
                      <button
                        type="button"
                        className={secondaryClass}
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
                      </button>
                    )
                  }
                />
                {/* The row is the file and its download; everything else a
                    file can do is folded here (2026-10-08). */}
                <Details summary={c("관리·상세", "Manage & details")}>
                {(version.allowedActions.manage ||
                  version.allowedActions.unlink) && (
                  <div className="flex flex-wrap items-center gap-x-4 text-foreground">
                    {version.allowedActions.manage && (
                      <>
                        <button
                          type="button"
                          className={textAction}
                          onClick={() =>
                            setManagement({
                              versionId: version.id,
                              mode: "permission",
                            })
                          }
                        >
                          {c("자료 권한 관리", "Manage permissions")}
                        </button>
                        <button
                          type="button"
                          className={textAction}
                          onClick={() =>
                            setManagement({
                              versionId: version.id,
                              mode: "link",
                            })
                          }
                        >
                          {c("다른 프로젝트에 연결", "Link to another project")}
                        </button>
                        <TransferSteward
                          scope={scope}
                          version={version}
                          changed={reload}
                        />
                      </>
                    )}
                    {version.allowedActions.unlink && (
                      <button
                        type="button"
                        className={textAction}
                        onClick={() =>
                          setManagement({
                            versionId: version.id,
                            mode: "unlink",
                          })
                        }
                      >
                        {c("프로젝트 연결 제외", "Unlink from project")}
                      </button>
                    )}
                  </div>
                )}
                  <KeyValues items={versionFacts(version, c)} />
                  <VersionAddress scope={scope} versionId={version.id} />
                </Details>
              </li>
            ))}
          </ul>
          </>
        )}
        {(cursor || list.nextCursor) && (
          <div className="flex flex-wrap gap-3">
            {cursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(undefined)}
              >
                {c("처음 목록", "First page")}
              </button>
            )}
            {list.nextCursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(list.nextCursor!)}
              >
                {c("다음 목록", "Next page")}
              </button>
            )}
          </div>
        )}
      </section>
    </TeamShell>
  );
}

type Copy = (ko: string, en: string) => string;
const kinds: Record<TeamFileVersion["kind"], [string, string]> = {
  original: ["원본", "Original"],
  output: ["결과물", "Output"],
  working: ["작업 자료", "Working files"],
};

/**
 * The head of a stored version's row, shared by 프로젝트 자료 and 보관함 so the
 * same version reads the same in both: its series name as the heading, one
 * meta line, the preview state as the pill and the one primary action.
 */
export function VersionHeader({
  version,
  action,
}: {
  version: TeamFileVersion;
  action?: ReactNode;
}) {
  const c = useCopy();
  const Icon = version.kind === "output" ? Film : version.kind === "working" ? FileCog : FileIcon;
  return (
    <div className={fileGrid}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
          <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-medium">{version.assetName}</h2>
          <p className="truncate text-xs text-muted tabular-nums">
            {version.name} · {c("버전", "Version")} {version.ordinal}
            <span className="sm:hidden">
              {" "}· {bytes(version.size)} · {c(...kinds[version.kind])}
            </span>
          </p>
        </div>
      </div>
      <p className="hidden text-[13px] text-muted tabular-nums sm:block">
        {bytes(version.size)} · {c(...kinds[version.kind])}
      </p>
      <span
        aria-live="polite"
        className="hidden w-fit items-center rounded-full border border-border px-2 py-0.5 text-xs sm:inline-flex"
      >
        {previewStateCopy(version.previewState, c)}
      </span>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

/** One grid for the file list's head and every row, so they line up like a
 * table while each row stays a list item with its own actions under it. */
const fileGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_9rem_10rem_8rem]";
/** Actions and details under a row line up with the file name, not the icon. */
export const fileRowClass = "space-y-1.5 border-b border-border py-3 sm:[&>*:not(:first-child)]:pl-11";

export function FileListHead() {
  const c = useCopy();
  return (
    <div aria-hidden="true" className={`${fileGrid} hidden h-11 border-b border-border text-xs font-medium text-muted sm:grid`}>
      <span>{c("이름", "Name")}</span>
      <span>{c("크기·종류", "Size · kind")}</span>
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
