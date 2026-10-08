"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { apiClient } from "@/lib/api/client";
import {
  b2bService,
  type B2bStatus,
  type TeamHome,
} from "@/lib/api/services/b2b.service";
import {
  assertHomeScope,
  homeEnvironment,
  homeScopeKey,
  type HomeScope,
} from "@/lib/b2b-home/home";
import {
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { href as notificationHref } from "@/lib/b2b-notifications/notifications";
import {
  B2bError,
  StateBadge,
  VisibilityBadge,
  errorCode,
  roleLabels,
  useCopy,
} from "./shared";
import { ReviewWorkPanel } from "./review-work";
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const periods = {
  current: ["현재 이용기간", "Current period"],
  scheduled: ["다음 기간 예정", "Next period scheduled"],
  withheld: ["환불 확인 중 · 사용 보류", "Refund pending · use withheld"],
  ended: ["종료된 기간", "Ended period"],
} as const;
const licences = {
  active: ["편집 좌석 있음", "Editing seat"],
  scheduled: ["다음 기간 좌석 예정", "Seat next period"],
  revoking: ["좌석 해제 중", "Seat being released"],
  released: ["좌석 해제됨", "Seat released"],
  expired: ["좌석 종료", "Seat ended"],
} as const;
const transfers: Record<string, [string, string]> = {
  preparing: ["전송 준비", "Preparing"],
  uploading: ["전송 중", "Uploading"],
  verifying: ["서버 검증 중", "Server verification"],
  quarantined: ["검증 문제 · 확인 필요", "Verification needs attention"],
  expired: ["전송 만료 · 확인 필요", "Transfer expired"],
};
export function B2bHome({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const context = useWorkspace();
  const scope: HomeScope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    userId: context?.data.currentUserId ?? "",
    workspaceId: workspace.id,
  };
  const key = JSON.stringify([
    homeScopeKey(scope),
    status.team.currentState,
    status.allowedActions.projects,
  ]);
  return (
    <ScopedHome key={key} scope={scope} status={status} workspace={workspace} />
  );
}
function ScopedHome({
  scope,
  status,
  workspace,
}: {
  scope: HomeScope;
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy(),
    base = `/dashboard/workspaces/${workspace.id}`;
  const [data, setData] = useState<TeamHome | null>(null),
    [error, setError] = useState("");
  const lifetime = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const load = useCallback(async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    const ticket = ++sequence.current;
    try {
      const result = await b2bService.home(scope, controller.signal);
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(null);
      setError(errorCode(e));
    }
  }, [scope]);
  useLayoutEffect(() => {
    const calls = sequence,
      controller = new AbortController();
    lifetime.current = controller;
    return () => {
      controller.abort();
      calls.current++;
    };
  }, []);
  useEffect(() => {
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const account = () => {
      try {
        assertHomeScope(
          scope,
          homeEnvironment(new URL(apiClient.defaults.baseURL!).origin),
          lifetime.current?.signal,
        );
      } catch {
        setData(null);
        setError("B2B_HOME_SCOPE_CHANGED");
        lifetime.current?.abort();
      }
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", account);
    window.addEventListener("workspaces:changed", refresh);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", account);
      window.removeEventListener("workspaces:changed", refresh);
    };
  }, [load, scope]);
  const state = data?.currentState ?? status.team.currentState,
    readable = !!data && ["active", "read_only"].includes(state);
  const projectLink = (id: string, suffix = "") =>
    `${base}/projects/${id}${suffix}`;
  const listClass = "divide-y divide-border border-y border-border";
  const rowClass = "block min-h-14 py-3 transition-colors hover:bg-surface";
  const empty = (text: string) => <p className="text-[13px] text-muted">{text}</p>;
  return (
    <TeamShell title={workspace.name}>
      {/* The sidebar already lists every page; this only says what the
          team's state means right now, and links the one page that state
          sends you to. An active team needs no sentence. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <SpaceBadge workspace={workspace} />
          <StateBadge state={state} />
        </div>
        {state !== "active" && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span>
              {state === "preparing"
                ? c(
                    "첫 이용권 반영 전에는 이용기간이 시작되지 않습니다.",
                    "The period starts when the first purchase is applied.",
                  )
                : state === "read_only"
                  ? c(
                      "이용기간이 종료되어 열람과 다운로드만 가능합니다.",
                      "The period has ended. Reading and downloading remain.",
                    )
                  : c(
                      "팀 자료 접근이 중지되었습니다.",
                      "Access to team content is paused.",
                    )}
            </span>
            {state === "preparing" ? (
              status.allowedActions.billing && (
                <Link className="text-foreground underline underline-offset-4" href={`${base}/plan`}>
                  {c("플랜과 결제", "Plan and billing")}
                </Link>
              )
            ) : (
              <Link className="text-foreground underline underline-offset-4" href={`${base}/status`}>
                {c("이용 상태", "Team status")}
              </Link>
            )}
          </p>
        )}
      </div>
      {error && <B2bError code={error} retry={() => void load()} />}
      {!data && !error && <TeamLoading />}
      {data && readable && (
        <>
          <Section
            title={c("내 폴더", "My folders")}
            action={
              <Link href={`${base}/projects`} className={linkClass}>
                {c("전체 보기", "View all")}
              </Link>
            }
          >
            {data.projects.items.length ? (
              <ul className={listClass}>
                {data.projects.items.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={projectLink(p.id)}
                      className={`${rowClass} flex flex-wrap items-center justify-between gap-3`}
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{p.name}</p>
                        <p className="mt-0.5 text-xs text-muted tabular-nums">
                          {c(...roleLabels[p.role])} · {date(p.updatedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <VisibilityBadge visibility={p.visibility} />
                        <StateBadge state={p.state} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              empty(c("참여한 폴더가 없습니다.", "You are not in any folder yet."))
            )}
          </Section>
          <Section title={c("최근 발행", "Recently published")}>
            {data.recentPublications.items.length ? (
              <ul className={listClass}>
                {data.recentPublications.items.map((p) => (
                  <li key={p.publicationId}>
                    <Link
                      href={notificationHref({
                        kind: "review",
                        workspaceId: workspace.id,
                        projectId: p.projectId,
                        reviewId: p.reviewId,
                        round: p.round,
                        versionId: p.versionId,
                      })}
                      className={rowClass}
                    >
                      {/* One item, one name: the item (review) title and its version. */}
                      <p className="break-words text-sm font-medium tabular-nums">
                        {p.title} · v{p.ordinal}
                      </p>
                      <p className="mt-0.5 break-words text-xs text-muted tabular-nums">
                        {p.projectName} · {c("회차", "Round")} {p.round} ·{" "}
                        {date(p.publishedAt)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              empty(
                c(
                  "지금 볼 수 있는 발행 영상이 없습니다.",
                  "No published videos you can open yet.",
                ),
              )
            )}
          </Section>
        </>
      )}
      {status.allowedActions.projects && <ReviewWorkPanel />}
      {/* Only when something is moving: an idle transfer list is noise. */}
      {data && readable && data.transfers.items.length > 0 && (
        <Section title={c("내 원본 전송", "My source transfers")}>
          <ul className={listClass}>
            {data.transfers.items.map((t) => (
              <li key={t.id}>
                <Link href={projectLink(t.projectId, "/files")} className={rowClass}>
                  <p className="break-words text-sm font-medium">{t.name}</p>
                  <p className="mt-0.5 break-words text-xs text-muted">
                    {t.projectName} ·{" "}
                    {transfers[t.state] ? c(...transfers[t.state]) : t.state}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {data && (
        <Section title={c("내 좌석", "My seat")}>
          {data.seat === "waiting" && (
            <p className="text-[13px] text-muted">
              {c(
                "남은 좌석이 없어 대기 중입니다. 자리가 나거나 좌석이 추가되면 자동으로 배정됩니다.",
                "No seat is free yet. You get one automatically when a seat frees up or is added.",
              )}
            </p>
          )}
          {!data.period &&
            empty(
              c(
                "첫 구매가 반영되면 이용기간이 시작됩니다.",
                "The first applied purchase starts the entitlement period.",
              ),
            )}
          {data.period && !data.periods.length && (
            <p className="text-[13px] tabular-nums">
              {date(data.period.startsAt)} — {date(data.period.endsAt)} KST
            </p>
          )}
          {data.periods.length > 0 && (
            <ul className={listClass}>
              {data.periods.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {c(periods[p.state][0], periods[p.state][1])}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted">
                      {date(p.startsAt)} — {date(p.endsAt)} KST
                      {p.licence?.scheduledRevokeAt &&
                        ` · ${c("회수 예정", "Revocation scheduled")} ${date(p.licence.scheduledRevokeAt)}`}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs">
                    {p.licence
                      ? c(licences[p.licence.state][0], licences[p.licence.state][1])
                      : p.state === "current" && data.seat === "waiting"
                        ? c("좌석 대기", "Waiting for a seat")
                        : c("편집 좌석 없음 · 보기만", "No editing seat · view only")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </TeamShell>
  );
}
const linkClass =
  "text-[13px] text-muted underline-offset-4 transition-colors hover:text-foreground hover:underline";
/** A named region: the e2e suite and assistive tech find these by name, so it
 *  is a `<section aria-label>` rather than the shared `Block`. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 border-b border-border pb-8 last:border-b-0 last:pb-0"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
