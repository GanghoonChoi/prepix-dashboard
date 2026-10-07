"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ReviewWorkList, ReviewWorkQuery } from "@/lib/api/generated/b2b";
import { origin, reviewEvents, reviewsService } from "@/lib/api/services/b2b-reviews.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass, secondaryClass } from "@/components/workspaces/shared";
import { B2bError, accessEnded, errorCode, useCopy } from "./shared";
import { approvalCopy } from "./reviews";

// SOT: prepix-backend backend/docs/b2b-reviews.md "업무 API". Independent of
// request work: its own counts, cards and failures.
type Scope = { origin: string; userId: string; workspaceId: string; projectId?: string };
type View = NonNullable<ReviewWorkQuery["view"]>;
type Filters = { view: View; search: string; cursor?: string };

export function ReviewWorkPanel({ projectId, onDenied }: { projectId?: string; onDenied?: () => Promise<void> }) {
  const context = useWorkspace();
  if (!context?.b2b?.enrolled || !context.b2b.allowedActions.projects || !context.data.currentUserId)
    return null;
  const scope: Scope = {
    origin: origin(),
    workspaceId: context.data.workspace.id,
    userId: context.data.currentUserId,
    projectId,
  };
  return <ScopedPanel key={JSON.stringify(scope)} scope={scope} onDenied={onDenied} />;
}

function ScopedPanel({ scope, onDenied }: { scope: Scope; onDenied?: () => Promise<void> }) {
  const c = useCopy();
  const [filters, setFilters] = useState<Filters>({ view: "all", search: "" });
  const [search, setSearch] = useState("");
  const [data, setData] = useState<ReviewWorkList | null>(null);
  const [error, setError] = useState("");
  const serial = useRef(0),
    mounted = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++serial.current;
    try {
      const value = await reviewsService.work(scope, filters);
      if (!mounted.current || ticket !== serial.current) return;
      setData(value);
      setError("");
    } catch (e) {
      if (!mounted.current || ticket !== serial.current) return;
      // Transient failures keep the last answer with a retry; a definitive
      // refusal clears counts and cards together.
      if (accessEnded(e) || (e instanceof Error && e.message === "B2B_FILE_ACCOUNT_CHANGED")) {
        setData(null);
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 403 || status === 404) void onDenied?.();
      }
      setError(errorCode(e));
    }
  }, [scope, filters, onDenied]);
  useEffect(() => {
    const counter = serial;
    mounted.current = true;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener(reviewEvents, refresh);
    return () => {
      mounted.current = false;
      counter.current++;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(reviewEvents, refresh);
    };
  }, [load]);
  const views: [View, string, number | undefined][] = [
    ["approvals", c("내 승인 대기", "My approvals"), data?.counts.approvals],
    ["changes", c("수정 요청", "Changes requested"), data?.counts.changes],
  ];
  return (
    <section className="space-y-4 border-b border-border pb-8" aria-label={c("검토·승인 업무", "Review and approval work")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium">{c("검토·승인 업무", "Review and approval work")}</h2>
        <form
          className="flex w-full min-w-0 gap-2 sm:w-auto"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ view: filters.view, search: search.trim() });
          }}
        >
          <input
            className={`${inputClass} min-w-0 max-w-64`}
            aria-label={c("검토 업무 검색", "Search review work")}
            placeholder={c("검토·폴더 검색", "Search reviews and folders")}
            maxLength={100}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className={`${secondaryClass} shrink-0`}>
            {c("검색", "Search")}
          </button>
        </form>
      </div>
      {error && <B2bError code={error} retry={() => void load()} />}
      {!data && !error && (
        <p role="status" className="text-sm text-muted">
          {c("검토 업무를 불러오는 중입니다.", "Loading review work.")}
        </p>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {views.map(([view, label, count]) => (
              <button
                key={view}
                className="min-h-20 rounded-lg border border-border p-3 text-left hover:bg-surface"
                aria-pressed={filters.view === view}
                onClick={() => setFilters({ view, search: filters.search })}
              >
                <span className="block text-xs text-muted">{label}</span>
                <span className="mt-1 block text-xl font-medium tabular-nums">{count}</span>
              </button>
            ))}
            <div className="min-h-20 rounded-lg border border-border p-3">
              <span className="block text-xs text-muted">{c("승인 대기 검토", "Awaiting approval")}</span>
              <span className="mt-1 block text-xl font-medium tabular-nums">{data.counts.awaiting}</span>
            </div>
            <div className="min-h-20 rounded-lg border border-border p-3">
              <span className="block text-xs text-muted">{c("승인자 지정 필요", "Need an approver")}</span>
              <span className="mt-1 block text-xl font-medium tabular-nums">{data.counts.unassigned}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className={secondaryClass} aria-pressed={filters.view === "all"} onClick={() => setFilters({ view: "all", search: filters.search })}>
              {c("진행 중 검토 전체", "All open reviews")}
            </button>
            {scope.projectId && (
              <Link className={secondaryClass} href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/reviews`}>
                {c("폴더 검토 전체", "All folder reviews")}
              </Link>
            )}
          </div>
          {data.cards.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {data.cards.map((card) => (
                <li key={card.id}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-surface"
                    href={`/dashboard/workspaces/${scope.workspaceId}/projects/${card.projectId}/reviews/${card.id}`}
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      {!scope.projectId && <p className="mb-1 break-words text-xs text-muted">{card.projectName}</p>}
                      <p className="break-words text-sm font-medium">{card.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {c(...approvalCopy[card.approval])} · {c("회차", "Round")} {card.round}
                        {card.myApproval && ` · ${c("내가 승인자", "You approve")}`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-border p-5 text-sm text-muted">
              {c("현재 조건에 해당하는 검토 업무가 없습니다.", "No review work in this view.")}
            </p>
          )}
          {(filters.cursor || data.nextCursor) && (
            <div className="flex flex-wrap gap-3">
              {filters.cursor && (
                <button className={secondaryClass} onClick={() => setFilters({ view: filters.view, search: filters.search })}>
                  {c("처음 페이지", "First page")}
                </button>
              )}
              {data.nextCursor && (
                <button className={secondaryClass} onClick={() => setFilters({ ...filters, cursor: data.nextCursor! })}>
                  {c("다음 업무", "Next work")}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
