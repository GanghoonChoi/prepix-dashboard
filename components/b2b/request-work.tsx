"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { apiClient } from "@/lib/api/client";
import { requestsService } from "@/lib/api/services/b2b-requests.service";
import {
  requestEvents,
  type RequestScope,
} from "@/lib/b2b-requests/operations";
import type {
  RequestWorkList,
  RequestWorkQuery,
} from "@/lib/api/generated/b2b";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass, secondaryClass } from "@/components/workspaces/shared";
import {
  B2bError,
  accessEnded,
  errorCode,
  StateBadge,
  useCopy,
} from "./shared";

type Scope = {
  origin: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
};
type View = NonNullable<RequestWorkQuery["view"]>;
type Filters = { view: View; search: string; cursor?: string };

// No cross-account/project cache. Changing the scope unmounts pending reads
// and the last authorized response before the next page can paint.
export function RequestWorkPanel({
  projectId,
  onDenied,
}: { projectId?: string; onDenied?: () => Promise<void> }) {
  const context = useWorkspace();
  if (
    !context?.b2b?.enrolled ||
    !context.b2b.allowedActions.projects ||
    !context.data.currentUserId
  )
    return null;
  const scope: Scope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    workspaceId: context.data.workspace.id,
    userId: context.data.currentUserId,
    projectId,
  };
  return (
    <ScopedPanel
      key={JSON.stringify(scope)}
      scope={scope}
      onDenied={onDenied}
    />
  );
}

function ScopedPanel({
  scope,
  onDenied,
}: { scope: Scope; onDenied?: () => Promise<void> }) {
  const c = useCopy();
  const [filters, setFilters] = useState<Filters>({ view: "all", search: "" });
  const [search, setSearch] = useState("");
  return (
    <section
      className="space-y-4 border-b border-border pb-8"
      aria-label={c("내 요청 업무", "My request work")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{c("내 요청 업무", "My request work")}</h2>
        <form
          className="flex w-full min-w-0 gap-2 sm:w-auto"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ view: filters.view, search: search.trim() });
          }}
        >
          <input
            className={`${inputClass} min-w-0 max-w-64`}
            aria-label={c("요청 업무 검색", "Search request work")}
            placeholder={c(
              "요청·프로젝트 검색",
              "Search requests and projects",
            )}
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="submit"
            className={`${secondaryClass} shrink-0 whitespace-nowrap`}
          >
            {c("검색", "Search")}
          </button>
        </form>
      </div>
      <WorkPage
        key={JSON.stringify(filters)}
        scope={scope}
        filters={filters}
        onFilter={setFilters}
        onDenied={onDenied}
      />
    </section>
  );
}

function WorkPage({
  scope,
  filters,
  onFilter,
  onDenied,
}: {
  scope: Scope;
  filters: Filters;
  onFilter: (next: Filters) => void;
  onDenied?: () => Promise<void>;
}) {
  const c = useCopy();
  const [data, setData] = useState<RequestWorkList | null>(null);
  const { lang } = useI18n();
  const [error, setError] = useState("");
  const serial = useRef(0),
    mounted = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++serial.current;
    try {
      const value = await requestsService.work(
        scope.workspaceId,
        scope.projectId,
        scope.userId,
        scope.origin,
        filters,
      );
      if (!mounted.current || ticket !== serial.current) return;
      setData(value);
      setError("");
    } catch (e) {
      if (!mounted.current || ticket !== serial.current) return;
      // A network failure preserves the last response with an explicit retry.
      // Any definitive refusal clears both cards and counts together.
      if (
        accessEnded(e) ||
        (e instanceof Error && e.message === "B2B_FILE_ACCOUNT_CHANGED")
      )
        setData(null);
      setError(errorCode(e));
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (
        status === 403 ||
        status === 404 ||
        (e instanceof Error && e.message === "B2B_FILE_ACCOUNT_CHANGED")
      )
        void onDenied?.();
    }
  }, [scope, filters, onDenied]);
  useEffect(() => {
    const counter = serial;
    mounted.current = true;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const changed = (event: Event) => {
      const other = (event as CustomEvent<RequestScope>).detail;
      if (
        other?.origin === scope.origin &&
        other.userId === scope.userId &&
        other.workspaceId === scope.workspaceId &&
        (!scope.projectId || other.projectId === scope.projectId)
      )
        refresh();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener(requestEvents, changed);
    return () => {
      mounted.current = false;
      counter.current++;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(requestEvents, changed);
    };
  }, [load, scope]);
  const choose = (view: View) => onFilter({ view, search: filters.search });
  return (
    <>
      {error && <B2bError code={error} retry={() => void load()} />}
      {!data && !error && (
        <p role="status" className="text-sm text-muted">
          {c("요청 업무를 불러오는 중입니다.", "Loading request work.")}
        </p>
      )}
      {data && (
        <>
          {data.teamState === "read_only" && (
            <p className="text-sm text-muted">
              {c(
                "현재 열람 기간입니다. 요청을 볼 수 있지만 변경할 수 없습니다.",
                "You can view requests during the read-only period; changes are unavailable.",
              )}
            </p>
          )}
          {scope.projectId && (
            <p
              className="text-sm tabular-nums"
              data-testid="required-request-progress"
            >
              {c("필수 요청 확인", "Required requests satisfied")}:{" "}
              {data.required.satisfied} / {data.required.total}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(
              [
                ["assigned", c("내 담당 요청", "Assigned to me")],
                ["confirming", c("내 확인 대기", "My confirmations")],
                ["proposals", c("내 접수 대기", "My intake")],
                ["overdue", c("기한 지난 업무", "Overdue work")],
              ] as const
            ).map(([view, label]) => (
              <button
                key={view}
                className="min-h-20 rounded-lg border border-border p-3 text-left hover:bg-surface"
                aria-pressed={filters.view === view}
                onClick={() => choose(view)}
              >
                <span className="block text-xs text-muted">{label}</span>
                <span className="mt-1 block text-xl font-medium tabular-nums">
                  {data.counts[view]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={secondaryClass}
              aria-pressed={filters.view === "all"}
              onClick={() => choose("all")}
            >
              {c("내 업무 전체", "All my work")}
            </button>
            {scope.projectId && (
              <Link
                className={secondaryClass}
                href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/requests`}
              >
                {c("프로젝트 요청 전체", "All project requests")}
              </Link>
            )}
            <button className={secondaryClass} onClick={() => void load()}>
              {c("업무 새로고침", "Refresh work")}
            </button>
          </div>
          {data.cards.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.cards.map((card) => (
                <li key={card.id}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-surface"
                    href={`/dashboard/workspaces/${scope.workspaceId}/projects/${card.projectId}/requests/${card.id}`}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      {!scope.projectId && (
                        <p className="mb-1 break-words text-xs text-muted">
                          {card.projectName}
                        </p>
                      )}
                      <p className="break-words text-sm font-medium">
                        {card.title}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {card.work === "proposal"
                          ? c("접수 대기", "Awaiting intake")
                          : card.work === "confirming"
                            ? c("확인 대기", "Awaiting confirmation")
                            : c("작업 담당", "Assigned work")}
                        {card.required && ` · ${c("필수", "Required")}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <StateBadge state={card.projectState} />
                      {card.dueAt && (
                        <span className="tabular-nums">
                          {card.overdue && `${c("기한 지남", "Overdue")} · `}
                          {new Date(card.dueAt).toLocaleString(
                            lang === "ko" ? "ko-KR" : "en-US",
                            {
                              timeZone: "Asia/Seoul",
                              dateStyle: "medium",
                              timeStyle: "short",
                            },
                          )}
                        </span>
                      )}
                      <span>
                        {card.canAct
                          ? card.work === "confirming"
                            ? c("확인하기", "Confirm")
                            : card.work === "proposal"
                              ? c("접수하기", "Review intake")
                              : c("요청 열기", "Open request")
                          : c("요청 보기", "View request")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-border p-5 text-sm text-muted">
              {filters.search
                ? c(
                    "검색 조건에 맞는 내 요청 업무가 없습니다.",
                    "No request work matches your search.",
                  )
                : c(
                    "현재 조건에 해당하는 내 요청 업무가 없습니다.",
                    "No request work in this view.",
                  )}
            </p>
          )}
          {(filters.cursor || data.nextCursor) && (
            <div className="flex flex-wrap gap-3">
              {filters.cursor && (
                <button
                  className={secondaryClass}
                  onClick={() =>
                    onFilter({ view: filters.view, search: filters.search })
                  }
                >
                  {c("처음 페이지", "First page")}
                </button>
              )}
              {data.nextCursor && (
                <button
                  className={secondaryClass}
                  onClick={() =>
                    onFilter({ ...filters, cursor: data.nextCursor! })
                  }
                >
                  {c("다음 업무", "Next work")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
