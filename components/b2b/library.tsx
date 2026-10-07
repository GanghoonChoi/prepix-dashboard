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
  Block,
  Details,
  EmptyState,
  inputClass,
  KeyValues,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";
import { FileTransfers } from "./file-transfers";
import { FileDownloads } from "./file-downloads";
import { TransferSteward, VersionAddress, StewardInbox } from "./file-stewards";
import {
  FileManager,
  PendingFileOperations,
  textAction,
} from "./file-management";
import { VersionHeader, versionFacts } from "./files";
import { TrashPanel, TrashVersion } from "./file-trash";

type TeamScope = Omit<FileScope, "projectId">;
export function TeamLibrary({
  versionId,
  sourceProjectId,
}: {
  versionId?: string;
  sourceProjectId?: string;
}) {
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
}: {
  scope: TeamScope;
  versionId?: string;
  sourceProjectId?: string;
}) {
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
  const searchForm = (
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
          maxLength={100}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={c("자료 이름 검색", "Search file names")}
        />
      </label>
      <label className="w-32 shrink-0 sm:w-40">
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
      <button className={secondaryClass}>{c("검색", "Search")}</button>
    </form>
  );
  const listed = data?.entries.some((e) => e.version.id !== versionId);
  return (
    <TeamShell
      title={c("보관함", "Library")}
      description={c(
        "폴더 없이 자료를 보관하고, 필요한 폴더에 연결합니다.",
        "Store files without a folder and link them where they're needed.",
      )}
    >
      {error ? (
        <B2bError code={error} retry={() => void reload()} />
      ) : !data ? (
        <TeamLoading />
      ) : (
        <>
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
          {storageError && <B2bError code={storageError} />}
          <section
            className="space-y-4 border-b border-border pb-8"
            aria-label={c("보관된 자료", "Stored files")}
          >
            {(data.entries.length > 0 || search || kind) && searchForm}
            {!data.entries.length && (
              <EmptyState
                title={
                  search || kind
                    ? c("검색 결과가 없습니다.", "No matching files.")
                    : c("아직 보관된 자료가 없습니다.", "No files yet.")
                }
              />
            )}
            {/* Every source keeps its group mounted — each owns the receipts
                and pending changes of its scope — so the rows share one rule
                line instead of each group drawing its own list. */}
            <div className={listed ? "border-t border-border" : undefined}>
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
            </div>
            {(cursor || data.nextCursor) && (
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
            )}
            {/* Stewardship recoveries involving me; renders nothing without. */}
            {context.b2b?.enrolled &&
              context.b2b.team.currentState === "active" &&
              context.b2b.member.kind === "internal" &&
              context.data.role !== "reviewer" && (
                <StewardInbox scope={scope} changed={reload} />
              )}
          </section>
          <TrashPanel scope={scope} changed={reload} />
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
    <Block title={c("주소로 선택한 버전", "Version selected by address")}>
      {error ? (
        <B2bError code={error} retry={() => void reload()} />
      ) : !entry ? (
        <TeamLoading />
      ) : (
        <div className="border-t border-border">
          <LibraryGroup
            scope={frozen}
            entries={[entry]}
            changed={() => {
              void reload();
              changed();
            }}
          />
        </div>
      )}
    </Block>
  );
}
function LibraryGroup({
  scope,
  entries,
  changed,
}: {
  scope: FileScope;
  entries: TeamLibraryEntry[];
  changed: () => void;
}) {
  const c = useCopy(),
    operations = useFileOperations(scope, true, changed),
    downloads = useFileDownloads(scope, true, changed);
  const [selection, setSelection] = useState<string>();
  const selected = entries.find((e) => e.version.id === selection && e.canLink);
  return (
    <section className="empty:hidden">
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
      {!!entries.length && (
        <ul>
          {entries.map((entry) => {
            const v = entry.version;
            return (
              <li
                key={v.id}
                data-testid={`library-file-${v.id}`}
                className="space-y-1 border-b border-border py-3"
              >
                <VersionHeader
                  version={v}
                  action={
                    v.allowedActions.download && (
                      <button
                        className={secondaryClass}
                        onClick={() => void downloads.start(v)}
                      >
                        {c("원본 받기", "Receive original")}
                      </button>
                    )
                  }
                />
                {(entry.canLink || v.allowedActions.manage) && (
                  <div className="flex flex-wrap items-center gap-x-4">
                    {entry.canLink && (
                      <button
                        className={textAction}
                        onClick={() => setSelection(v.id)}
                      >
                        {c("폴더에 연결", "Link to folder")}
                      </button>
                    )}
                    {v.allowedActions.manage && (
                      <TransferSteward
                        scope={scope}
                        version={v}
                        changed={changed}
                      />
                    )}
                    {entry.canLink && !entry.linked && (
                      <TrashVersion
                        scope={scope}
                        version={v}
                        changed={changed}
                      />
                    )}
                  </div>
                )}
                <Details
                  summary={c(
                    "버전 상세와 사용 위치",
                    "Version details and locations",
                  )}
                >
                  <KeyValues
                    items={[
                      [
                        c("등록 시각", "Registered"),
                        new Date(v.createdAt).toLocaleString(
                          c("ko-KR", "en-US"),
                          { timeZone: "Asia/Seoul" },
                        ),
                      ],
                      ...versionFacts(v, c),
                      [
                        c("사용 위치", "Used in"),
                        entry.locations.length ? (
                          <ul className="space-y-1">
                            {entry.locations.map((p) => (
                              <li key={p.projectId}>
                                <Link
                                  className="break-all text-foreground underline underline-offset-4"
                                  href={`/dashboard/workspaces/${scope.workspaceId}/projects/${p.projectId}/files`}
                                >
                                  {p.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          c(
                            "현재 표시할 수 있는 폴더 연결이 없습니다.",
                            "No folder links are currently visible.",
                          )
                        ),
                      ],
                    ]}
                  />
                  <VersionAddress scope={scope} versionId={v.id} />
                </Details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
