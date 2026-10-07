"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import type {
  TeamFileCapabilities,
  TeamLibraryEntry,
  TeamLibraryList,
} from "@/lib/api/generated/b2b";
import {
  fileApi,
  LIBRARY_SOURCE,
  fileError,
  libraryList,
  type FileScope,
} from "@/lib/b2b-files/api";
import { scopeKey } from "@/lib/b2b-files/store";
import { BrowserMutationStore } from "@/lib/b2b-files/mutations";
import { BrowserDownloadStore } from "@/lib/b2b-files/download-store";
import { useFileOperations } from "@/lib/b2b-files/use-operations";
import { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { bytes } from "@/lib/workspaces/upload";
import { B2bError, useCopy, previewStateCopy } from "./shared";
import { FileTransfers } from "./file-transfers";
import { FileDownloads } from "./file-downloads";
import { TransferSteward, VersionAddress, StewardInbox } from "./file-stewards";
import { FileManager, PendingFileOperations } from "./file-management";

import { TrashPanel, TrashVersion } from "./file-trash";

type TeamScope = Omit<FileScope, "projectId">;
export function TeamLibrary({
  versionId,
  sourceProjectId,
}: { versionId?: string; sourceProjectId?: string }) {
  const context = useWorkspace()!,
    { id } = context.data.workspace,
    userId = context.data.currentUserId;
  const scope = useMemo<TeamScope>(
    () => ({
      origin: new URL(apiClient.defaults.baseURL!).origin,
      userId: userId ?? "",
      workspaceId: id,
    }),
    [id, userId],
  );
  return context.b2b?.enrolled &&
    context.b2b.allowedActions.projects &&
    userId ? (
    <LibraryView
      key={JSON.stringify(scope)}
      scope={scope}
      versionId={versionId}
      sourceProjectId={sourceProjectId}
    />
  ) : (
    <B2bError code="B2B_PROJECT_NOT_FOUND" />
  );
}
function LibraryView({
  scope,
  versionId,
  sourceProjectId,
}: { scope: TeamScope; versionId?: string; sourceProjectId?: string }) {
  const context = useWorkspace()!;
  const c = useCopy();
  const directScope = useMemo<FileScope>(
    () => ({ ...scope, projectId: LIBRARY_SOURCE, library: true }),
    [scope],
  );
  const directApi = useMemo(() => fileApi(directScope), [directScope]);
  const [capabilities, setCapabilities] = useState<TeamFileCapabilities | null>(
    null,
  );
  const [data, setData] = useState<TeamLibraryList | null>(null),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [kind, setKind] = useState(""),
    [cursor, setCursor] = useState<string>();
  const [scopes, setScopes] = useState<FileScope[]>([]),
    [storageError, setStorageError] = useState("");
  const operationStore = useMemo(() => new BrowserMutationStore(), []),
    receiptStore = useMemo(() => new BrowserDownloadStore(), []);
  const serial = useRef(0),
    reader = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    const sequence = ++serial.current,
      abort = new AbortController();
    reader.current?.abort();
    reader.current = abort;
    try {
      const [result, cap] = await Promise.all([
        libraryList(scope, { search, kind, cursor }, abort.signal),
        directApi.capabilities(abort.signal),
      ]);
      if (cap.currentUserId !== scope.userId)
        throw new Error("B2B_FILE_ACCOUNT_CHANGED");
      if (sequence !== serial.current) return;
      setData(result);
      setCapabilities(cap);
      setError("");
      // Resume/check opaque own-account records even when filtering or a new
      // active source moves a version to a different list group.
      const persisted = await Promise.all([
        operationStore.scopes(scope),
        receiptStore.scopes(scope),
      ]).catch(() => null);
      if (sequence !== serial.current) return;
      setStorageError(persisted ? "" : "B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE");
      setScopes((prior) => {
        const next = new Map(prior.map((s) => [s.projectId, s]));
        for (const s of [
          ...(persisted?.flat() ?? []),
          directScope,
          ...result.entries.map((e) => ({
            projectId: e.version.projectId ?? LIBRARY_SOURCE,
          })),
        ]) {
          // Stable scope identity keeps a receive worker alive during polling
          // and filters; new sources do not retarget an existing receipt.
          if (!next.has(s.projectId))
            next.set(s.projectId, {
              ...scope,
              projectId: s.projectId,
              library: true,
            });
        }
        return next.size === prior.length ? prior : [...next.values()];
      });
    } catch (e) {
      if (sequence !== serial.current) return;
      setData(null);
      setCapabilities(null);
      setError(fileError(e));
    }
  }, [
    scope,
    directScope,
    directApi,
    search,
    kind,
    cursor,
    operationStore,
    receiptStore,
  ]);
  useEffect(() => {
    const sequence = serial,
      currentReader = reader;
    const start = window.setTimeout(() => void reload(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      ++sequence.current;
      currentReader.current?.abort();
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  return (
    <TeamShell
      title={c("보관함", "Library")}
      description={c(
        "폴더를 선택하지 않고 자료를 등록할 수 있습니다. 현재 접근이 허용된 버전만 표시하며, 사용할 폴더에 정확한 버전을 연결합니다.",
        "Register files without choosing a folder. Only accessible versions are shown; link an exact version to the folder where you need it.",
      )}
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
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={c("접근 가능한 자료 검색", "Search accessible files")}
          />
        </label>
        <label>
          <span className="sr-only">{c("자료 종류", "File kind")}</span>
          <select
            className={inputClass}
            value={kind}
            onChange={(e) => {
              setCursor(undefined);
              setKind(e.target.value);
            }}
          >
            <option value="">{c("모든 종류", "All kinds")}</option>
            <option value="original">{c("원본", "Original")}</option>
            <option value="output">{c("결과물", "Output")}</option>
            <option value="working">{c("작업 자료", "Working files")}</option>
          </select>
        </label>
        <button className={primaryClass}>{c("검색", "Search")}</button>
      </form>
      {error ? (
        <B2bError code={error} retry={() => void reload()} />
      ) : !data ? (
        <TeamLoading />
      ) : (
        <>
          {context.b2b?.enrolled &&
            context.b2b.team.currentState === "active" &&
            context.b2b.member.kind === "internal" &&
            context.data.role !== "reviewer" && (
              <StewardInbox scope={scope} changed={reload} />
            )}
          <TrashPanel scope={scope} changed={reload} />
          {storageError && <B2bError code={storageError} />}
          {versionId && (
            <AddressedVersion
              key={`${versionId}:${sourceProjectId ?? "library"}`}
              scope={scope}
              versionId={versionId}
              sourceProjectId={sourceProjectId}
              changed={reload}
            />
          )}
          {capabilities && (
            <FileTransfers
              scope={directScope}
              capabilities={capabilities}
              versions={data.entries
                .filter((e) => e.version.projectId === null)
                .map((e) => e.version)}
              changed={reload}
            />
          )}
          {!data.entries.length && (
            <p className="py-6 text-sm text-muted">
              {c(
                "현재 접근할 수 있는 보관 자료가 없습니다.",
                "No stored files are accessible to you.",
              )}
            </p>
          )}
          {scopes.map((s) => (
            <LibraryGroup
              key={scopeKey(s)}
              scope={s}
              entries={data.entries.filter(
                (e) =>
                  e.version.id !== versionId &&
                  (e.version.projectId ?? LIBRARY_SOURCE) === s.projectId,
              )}
              changed={reload}
            />
          ))}
          <div className="flex flex-wrap gap-3">
            {cursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(undefined)}
              >
                {c("처음으로", "First page")}
              </button>
            )}
            {data.nextCursor && (
              <button
                className={secondaryClass}
                onClick={() => setCursor(data.nextCursor!)}
              >
                {c("다음 자료", "More files")}
              </button>
            )}
          </div>
        </>
      )}
    </TeamShell>
  );
}
function AddressedVersion({
  scope,
  versionId,
  sourceProjectId,
  changed,
}: {
  scope: TeamScope;
  versionId: string;
  sourceProjectId?: string;
  changed: () => void;
}) {
  const c = useCopy(),
    [entry, setEntry] = useState<TeamLibraryEntry | null>(null),
    [error, setError] = useState("");
  const frozen = useMemo<FileScope>(
    () => ({
      ...scope,
      projectId: sourceProjectId ?? LIBRARY_SOURCE,
      library: true,
    }),
    [scope, sourceProjectId],
  );
  const api = useMemo(() => fileApi(frozen), [frozen]),
    reader = useRef<AbortController | null>(null),
    serial = useRef(0);
  const reload = useCallback(async () => {
    const sequence = ++serial.current,
      abort = new AbortController();
    reader.current?.abort();
    reader.current = abort;
    try {
      const uuid =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      if (
        !uuid.test(versionId) ||
        (sourceProjectId !== undefined && !uuid.test(sourceProjectId))
      )
        throw new Error("B2B_FILE_NOT_FOUND");
      const value = await api.libraryEntry(versionId, abort.signal);
      if (sequence === serial.current) {
        setEntry(value);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && sequence === serial.current) {
        setEntry(null);
        setError(fileError(e));
      }
    }
  }, [api, versionId, sourceProjectId]);
  useEffect(() => {
    const currentSerial = serial;
    const initial = window.setTimeout(() => void reload(), 0),
      timer = window.setInterval(() => void reload(), 15000);
    return () => {
      ++currentSerial.current;
      reader.current?.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [reload]);
  return (
    <section
      className="space-y-3 rounded-lg border border-border p-4"
      aria-label={c("주소로 선택한 버전", "Version selected by address")}
    >
      <h2 className="font-medium">
        {c("주소로 선택한 버전", "Version selected by address")}
      </h2>
      {error ? (
        <B2bError code={error} retry={() => void reload()} />
      ) : !entry ? (
        <TeamLoading />
      ) : (
        <LibraryGroup
          scope={frozen}
          entries={[entry]}
          changed={() => {
            void reload();
            changed();
          }}
        />
      )}
    </section>
  );
}
function LibraryGroup({
  scope,
  entries,
  changed,
}: { scope: FileScope; entries: TeamLibraryEntry[]; changed: () => void }) {
  const c = useCopy(),
    operations = useFileOperations(scope, true, changed),
    downloads = useFileDownloads(scope, true, changed);
  const [selection, setSelection] = useState<string>();
  const selected = entries.find((e) => e.version.id === selection && e.canLink);
  return (
    <section className="space-y-4">
      <FileDownloads downloads={downloads} />
      <PendingFileOperations operations={operations} />
      {selected && (
        <FileManager
          key={selected.version.id}
          scope={scope}
          version={selected.version}
          mode="link"
          operations={operations}
          close={() => setSelection(undefined)}
        />
      )}
      <ul className="divide-y divide-border">
        {entries.map((entry) => {
          const v = entry.version;
          return (
            <li
              key={v.id}
              data-testid={`library-file-${v.id}`}
              className="space-y-3 py-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="break-all font-medium">{v.assetName}</h2>
                  <p className="mt-1 break-all text-sm text-muted">
                    {v.name} · {c("버전", "Version")} {v.ordinal} ·{" "}
                    {bytes(v.size)} ·{" "}
                    {v.kind === "original"
                      ? c("원본", "Original")
                      : v.kind === "output"
                        ? c("결과물", "Output")
                        : c("작업 자료", "Working files")}
                  </p>
                  <p className="mt-1 text-sm text-muted" aria-live="polite">
                    {previewStateCopy(v.previewState, c)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.allowedActions.download && (
                    <button
                      className={secondaryClass}
                      onClick={() => void downloads.start(v)}
                    >
                      {c("원본 받기", "Receive original")}
                    </button>
                  )}
                  {entry.canLink && (
                    <button
                      className={secondaryClass}
                      onClick={() => setSelection(v.id)}
                    >
                      {c("폴더에 연결", "Link to folder")}
                    </button>
                  )}
                  {entry.canLink && !entry.linked && (
                    <TrashVersion scope={scope} version={v} changed={changed} />
                  )}
                  {v.allowedActions.manage && (
                    <TransferSteward
                      scope={scope}
                      version={v}
                      changed={changed}
                    />
                  )}
                </div>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">
                  {c("버전 상세와 사용 위치", "Version details and locations")}
                </summary>
                <div className="mt-3 space-y-2">
                  <VersionAddress scope={scope} versionId={v.id} />
                  <p className="text-muted">
                    {c("등록 시각", "Registered")}:{" "}
                    {new Date(v.createdAt).toLocaleString(c("ko-KR", "en-US"), {
                      timeZone: "Asia/Seoul",
                    })}
                  </p>
                  <p className="text-muted">
                    {v.metadata.container} ·{" "}
                    {v.metadata.durationMs !== null
                      ? `${(v.metadata.durationMs / 1000).toFixed(2)} ${c("초", "seconds")}`
                      : c("재생 길이 정보 없음", "Duration unavailable")}
                  </p>
                  {entry.locations.length ? (
                    <ul className="space-y-2">
                      {entry.locations.map((p) => (
                        <li key={p.projectId}>
                          <Link
                            className="underline underline-offset-4 break-all"
                            href={`/dashboard/workspaces/${scope.workspaceId}/projects/${p.projectId}/files`}
                          >
                            {p.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted">
                      {c(
                        "현재 표시할 수 있는 폴더 연결이 없습니다. 보관된 파일은 유지됩니다.",
                        "No folder links are currently visible. The stored file is retained.",
                      )}
                    </p>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
