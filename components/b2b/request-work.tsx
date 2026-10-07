"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
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
import {
  EmptyState,
  inputClass,
  secondaryClass,
} from "@/components/workspaces/shared";
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
}: {
  projectId?: string;
  onDenied?: () => Promise<void>;
}) {
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
}: {
  scope: Scope;
  onDenied?: () => Promise<void>;
}) {
  const c = useCopy();
  const [filters, setFilters] = useState<Filters>({ view: "all", search: "" });
  const [search, setSearch] = useState("");
  return (
    <section
      className="space-y-4 border-b border-border pb-8 last:border-b-0 last:pb-0"
      aria-label={c("내 요청 업무", "My request work")}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">
          {c("내 요청 업무", "My request work")}
        </h2>
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
            placeholder={c("요청·폴더 검색", "Search requests and folders")}
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
        <p role="status" className="text-[13px] text-muted">
          {c("요청 업무를 불러오는 중입니다.", "Loading request work.")}
        </p>
      )}
      {data && (
        <>
          {data.teamState === "read_only" && (
            <p className="text-[13px] text-muted">
              {c(
                "현재 열람 기간입니다. 요청을 볼 수 있지만 변경할 수 없습니다.",
                "You can view requests during the read-only period; changes are unavailable.",
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", c("내 업무 전체", "All my work"), null],
                [
                  "assigned",
                  c("내 담당 요청", "Assigned to me"),
                  data.counts.assigned,
                ],
                [
                  "confirming",
                  c("내 확인 대기", "My confirmations"),
                  data.counts.confirming,
                ],
                [
                  "proposals",
                  c("내 접수 대기", "My intake"),
                  data.counts.proposals,
                ],
                [
                  "overdue",
                  c("기한 지난 업무", "Overdue work"),
                  data.counts.overdue,
                ],
              ] as const
            ).map(([view, label, count]) => (
              <button
                key={view}
                type="button"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-[13px] text-muted transition-colors hover:text-foreground aria-pressed:border-foreground aria-pressed:text-foreground"
                aria-pressed={filters.view === view}
                onClick={() => choose(view)}
              >
                {label}
                {count !== null && (
                  <>
                    {" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {count}
                    </span>
                  </>
                )}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-3 text-[13px]">
              {scope.projectId && (
                <span
                  className="text-muted tabular-nums"
                  data-testid="required-request-progress"
                >
                  {c("필수 요청 확인", "Required requests satisfied")}:{" "}
                  {data.required.satisfied} / {data.required.total}
                </span>
              )}
              {scope.projectId && (
                <Link
                  className="text-muted underline-offset-4 hover:text-foreground hover:underline"
                  href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/requests`}
                >
                  {c("폴더 요청 전체", "All folder requests")}
                </Link>
              )}
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
                aria-label={c("업무 새로고침", "Refresh work")}
                title={c("업무 새로고침", "Refresh work")}
                onClick={() => void load()}
              >
                <RefreshCw size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </span>
          </div>
          {data.cards.length ? (
            <ul className="divide-y divide-border border-y border-border">
              {data.cards.map((card) => (
                <li key={card.id}>
                  <Link
                    className="flex items-center justify-between gap-3 py-3 hover:bg-surface"
                    href={`/dashboard/workspaces/${scope.workspaceId}/projects/${card.projectId}/requests/${card.id}`}
                  >
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">
                        {card.title}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-muted">
                        {!scope.projectId && `${card.projectName} · `}
                        {card.work === "proposal"
                          ? c("접수 대기", "Awaiting intake")
                          : card.work === "confirming"
                            ? c("확인 대기", "Awaiting confirmation")
                            : c("작업 담당", "Assigned work")}
                        {card.required && ` · ${c("필수", "Required")}`}
                        {card.dueAt && (
                          <span className="tabular-nums">
                            {" · "}
                            {card.overdue && `${c("기한 지남", "Overdue")} `}
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
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-muted">
                      <StateBadge state={card.projectState} />
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
            <EmptyState
              title={
                filters.search
                  ? c(
                      "검색 조건에 맞는 내 요청 업무가 없습니다.",
                      "No request work matches your search.",
                    )
                  : c(
                      "현재 조건에 해당하는 내 요청 업무가 없습니다.",
                      "No request work in this view.",
                    )
              }
            />
          )}
          {(filters.cursor || data.nextCursor) && (
            <div className="flex flex-wrap gap-2">
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
