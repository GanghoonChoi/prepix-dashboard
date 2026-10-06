"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import {
  b2bService,
  type Project,
  type TeamFileCapabilities,
  type TeamFileVersionList,
} from "@/lib/api/services/b2b.service";
import { fileApi, fileError, type FileScope } from "@/lib/b2b-files/api";
import { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { FileDownloads } from "./file-downloads";
import { scopeKey } from "@/lib/b2b-files/store";
import { bytes } from "@/lib/workspaces/upload";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { FileTransfers } from "./file-transfers";
import { B2bError, useCopy } from "./shared";
import { useFileOperations } from "@/lib/b2b-files/use-operations";
import {
  FileManager,
  PendingFileOperations,
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
    <B2bError code="B2B_PROJECT_NOT_FOUND" />
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
    >
      <Link
        className={secondaryClass}
        href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}`}
      >
        {c("프로젝트 개요", "Project overview")}
      </Link>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted tabular-nums">
        <span>
          {c("팀 사용량", "Team storage used")}:{" "}
          {bytes(Number(capabilities.storage.usedBytes))}
        </span>
        <span>
          {c("진행 중 예약", "Reserved for transfers")}:{" "}
          {bytes(Number(capabilities.storage.reservedBytes))}
        </span>
        <span>
          {c("팀 저장 정원", "Team storage capacity")}:{" "}
          {bytes(Number(capabilities.storage.limitBytes))}
        </span>
      </div>
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
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            setCursor(undefined);
            setSearch(query.trim());
          }}
        >
          <label className="flex-1">
            <span className="sr-only">
              {c("자료 이름 검색", "Search file names")}
            </span>
            <input
              className={inputClass}
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={c(
                "접근 가능한 자료 검색",
                "Search accessible files",
              )}
            />
          </label>
          <button type="submit" className={primaryClass}>
            {c("검색", "Search")}
          </button>
        </form>
        {!list.versions.length && (
          <p className="py-8 text-sm text-muted">
            {c(
              "현재 접근할 수 있는 보관 자료가 없습니다.",
              "No stored files are accessible to you.",
            )}
          </p>
        )}
        <ul className="divide-y divide-border">
          {list.versions.map((version) => (
            <li className="space-y-3 py-5" key={version.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="break-all font-medium">{version.assetName}</h2>
                  <p className="mt-1 break-all text-sm text-muted">
                    {version.name} · {c("버전", "Version")} {version.ordinal} ·{" "}
                    {bytes(version.size)} ·{" "}
                    {version.kind === "original"
                      ? c("원본", "Original")
                      : version.kind === "output"
                        ? c("결과물", "Output")
                        : c("작업 자료", "Working files")}
                  </p>
                </div>
                {version.allowedActions.download && (
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
                )}
              </div>
              <details className="text-sm text-muted">
                <summary className="min-h-11 cursor-pointer py-3 focus-visible:outline-2 focus-visible:outline-foreground">
                  {c(
                    "이 버전의 파일 정보",
                    "File information for this version",
                  )}
                </summary>
                <dl className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <dt>{c("컨테이너", "Container")}</dt>
                  <dd>{version.metadata.container}</dd>
                  <dt>{c("길이", "Duration")}</dt>
                  <dd className="tabular-nums">
                    {version.metadata.durationMs === null
                      ? c("정보 없음", "Unavailable")
                      : `${(version.metadata.durationMs / 1000).toLocaleString()} s`}
                  </dd>
                  <dt>SHA-256</dt>
                  <dd className="break-all font-mono text-xs">
                    {version.sha256}
                  </dd>
                  <dt>{c("미리보기", "Preview")}</dt>
                  <dd>
                    {c(
                      "미생성 · 원본은 재생용으로 가져오지 않습니다.",
                      "Not generated; the original is not fetched for playback.",
                    )}
                  </dd>
                </dl>
              </details>
              <div className="flex flex-wrap gap-3">
                {version.allowedActions.manage && (
                  <>
                    <button
                      type="button"
                      className={secondaryClass}
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
                      className={secondaryClass}
                      onClick={() =>
                        setManagement({ versionId: version.id, mode: "link" })
                      }
                    >
                      {c("다른 프로젝트에 연결", "Link to another project")}
                    </button>
                  </>
                )}
                {version.allowedActions.unlink && (
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() =>
                      setManagement({ versionId: version.id, mode: "unlink" })
                    }
                  >
                    {c("프로젝트 연결 제외", "Unlink from project")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
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
      </section>
    </TeamShell>
  );
}
