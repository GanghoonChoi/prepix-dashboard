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
  TeamShell,
  secondaryClass,
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
import { RequestWorkPanel } from "./request-work";
import { ReviewWorkPanel } from "./review-work";
const date = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const count = (n: number | string) =>
  new Intl.NumberFormat("ko-KR").format(BigInt(n));
const periods = {
  current: ["현재 이용기간", "Current period"],
  scheduled: ["다음 기간 예정", "Next period scheduled"],
  withheld: ["환불 확인 중 · 사용 보류", "Refund pending · use withheld"],
  ended: ["종료된 기간", "Ended period"],
} as const;
const licences = {
  active: ["편집 이용권 배정 중", "Editing licence assigned"],
  scheduled: ["다음 기간 편집 예정", "Editing scheduled"],
  revoking: ["편집 이용권 회수 대기", "Licence revocation pending"],
  released: ["편집 이용권 회수 완료", "Licence released"],
  expired: ["편집 이용권 종료", "Licence expired"],
} as const;
const jobs: Record<string, [string, string]> = {
  queued: ["접수됨", "Queued"],
  running: ["처리 중", "Running"],
  cancel_requested: ["취소 처리 중", "Cancelling"],
  completed: ["완료", "Completed"],
  failed: ["실패", "Failed"],
  cancelled: ["취소 완료", "Cancelled"],
  timed_out: ["시간 초과", "Timed out"],
};
const transfers: Record<string, [string, string]> = {
  preparing: ["전송 준비", "Preparing"],
  uploading: ["전송 중", "Uploading"],
  verifying: ["서버 검증 중", "Server verification"],
  quarantined: ["검증 문제 · 확인 필요", "Verification needs attention"],
  expired: ["전송 만료 · 확인 필요", "Transfer expired"],
};
const deliveries = {
  prepare: ["납품 준비", "Prepare delivery"],
  check: ["납품 조건 확인", "Check delivery conditions"],
  confirm: ["내 열기 확인 대기", "My opening confirmation pending"],
  confirmed: ["내 열기 확인 기록 있음", "My opening receipt recorded"],
} as const;
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
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const lifetime = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const load = useCallback(async () => {
    const controller = lifetime.current;
    if (!controller || controller.signal.aborted) return;
    const ticket = ++sequence.current;
    setBusy(true);
    try {
      const result = await b2bService.home(scope, controller.signal);
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(result);
      setError("");
    } catch (e) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      setData(null);
      setError(errorCode(e));
    } finally {
      if (!controller.signal.aborted && ticket === sequence.current)
        setBusy(false);
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
  const listClass = "divide-y divide-border rounded-lg border border-border";
  return (
    <TeamShell title={workspace.name}>
      <section className="space-y-5 border-b border-border pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <SpaceBadge workspace={workspace} />
          <StateBadge state={state} />
        </div>
        <p className="max-w-2xl text-pretty text-sm leading-6 text-muted">
          {state === "preparing"
            ? c(
                "팀 설정과 구매를 준비할 수 있습니다. 첫 이용권 반영 전에는 이용기간이 시작되지 않습니다.",
                "Prepare team settings and a purchase. The period starts when the first purchase is applied.",
              )
            : state === "active"
              ? c(
                  "참여한 프로젝트와 지금 해야 할 업무를 확인하세요. 웹 참여와 앱 편집 이용권은 따로 관리됩니다.",
                  "Review participating projects and current work. Web access and app editing licences are managed separately.",
                )
              : state === "read_only"
                ? c(
                    "이용기간이 종료되었습니다. 기존 권한 안에서 자료 열람과 다운로드가 가능합니다.",
                    "The period has ended. Existing access permits reading and downloading.",
                  )
                : c(
                    "팀 자료 접근이 중지되었습니다. 이용 상태에서 복구·삭제 일정을 확인하세요.",
                    "Access to team content is paused. Review recovery and deletion dates in team status.",
                  )}
        </p>
        <div className="flex flex-wrap gap-3">
          {status.allowedActions.projects && (
            <Link className={secondaryClass} href={`${base}/projects`}>
              {c("내 프로젝트 전체", "All my projects")}
            </Link>
          )}
          {status.allowedActions.billing && (
            <Link className={secondaryClass} href={`${base}/plan`}>
              {c("플랜과 결제", "Plan and billing")}
            </Link>
          )}
          {status.allowedActions.manage && (
            <Link className={secondaryClass} href={`${base}/settings`}>
              {c("팀 설정", "Team settings")}
            </Link>
          )}
          <Link className={secondaryClass} href={`${base}/status`}>
            {c("이용 상태", "Team status")}
          </Link>
        </div>
      </section>
      {error && (
        <div role="alert" className="space-y-3">
          <B2bError code={error} />
          <button
            className={secondaryClass}
            onClick={() => void load()}
            disabled={busy}
          >
            {c("홈 다시 확인", "Refresh home")}
          </button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-muted">
          {c(
            "내 프로젝트와 이용 상태를 확인하고 있습니다.",
            "Checking your projects and entitlement status.",
          )}
        </p>
      )}
      {data && (
        <>
          <section
            className="space-y-4 border-b border-border pb-8"
            aria-label={c("내 이용기간과 한도", "My periods and limits")}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-medium">
                {c("내 이용기간과 한도", "My periods and limits")}
              </h2>
              <Link
                href={`${base}/licences`}
                className="text-sm underline underline-offset-4"
              >
                {c("내 편집 이용권 확인", "View my editing licence")}
              </Link>
            </div>
            {data.period ? (
              <div className="rounded-lg bg-card p-4 text-sm leading-6 tabular-nums">
                <p>
                  {c("현재 기준 이용기간", "Current entitlement period")}:{" "}
                  {date(data.period.startsAt)} — {date(data.period.endsAt)} KST
                </p>
                <p className="text-muted">
                  {c("기간 종료 후 열람·다운로드 종료", "Read and export ends")}
                  : {date(data.period.readUntil)} KST
                </p>
                <p className="text-muted">
                  {c(
                    "복구 보관 종료·삭제 예정",
                    "Recovery storage ends · deletion scheduled",
                  )}
                  : {date(data.period.recoveryUntil)} KST
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted">
                {c(
                  "첫 구매가 반영되면 이용기간이 시작됩니다.",
                  "The first applied purchase starts the entitlement period.",
                )}
              </p>
            )}
            {data.periods.length > 0 && (
              <ul className={listClass}>
                {data.periods.map((p) => (
                  <li key={p.id} className="space-y-2 p-4 text-sm">
                    <p className="font-medium">
                      {c(periods[p.state][0], periods[p.state][1])}
                    </p>
                    <p className="tabular-nums text-muted">
                      {date(p.startsAt)} — {date(p.endsAt)} KST
                    </p>
                    <p>
                      {p.licence
                        ? c(
                            licences[p.licence.state][0],
                            licences[p.licence.state][1],
                          )
                        : c(
                            "내 편집 이용권 미배정",
                            "No editing licence assigned to me",
                          )}
                      {p.licence?.scheduledRevokeAt && (
                        <span className="tabular-nums text-muted">
                          {" "}
                          · {c("회수 예정", "Revocation scheduled")}{" "}
                          {date(p.licence.scheduledRevokeAt)} KST
                        </span>
                      )}
                    </p>
                    <p className="tabular-nums">
                      {p.aiBudget
                        ? `${c("내 AI 한도", "My AI limit")} ${count(p.aiBudget.limitUnits)} ${p.aiUnitLabel} · ${c("확정 사용", "Confirmed")} ${count(p.aiBudget.confirmedUnits)} · ${c("예약 중", "Reserved")} ${count(p.aiBudget.reservedUnits)} · ${c("한도 내 남음", "Remaining allowance")} ${count(p.aiBudget.remainingUnits)}`
                        : c(
                            "내 AI 한도가 배정되지 않았습니다.",
                            "No AI spending limit is assigned to me.",
                          )}
                    </p>
                    <p className="text-xs leading-5 text-muted">
                      {p.aiUnitDescription}
                      {p.state === "withheld"
                        ? c(
                            " · 환불 확인 전에는 이 기간을 사용할 수 없습니다.",
                            " · This period is withheld pending refund confirmation.",
                          )
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {readable && (
              <div className="space-y-1 text-sm">
                <p className="tabular-nums">
                  {data.aiUsage?.reconciled &&
                  data.aiUsage.availableUnits !== null
                    ? `${c("팀 AI 잔액", "Team AI balance")} ${count(data.aiUsage.availableUnits)}`
                    : c(
                        "팀 AI 잔액을 확인하지 못했습니다. AI 사용량에서 다시 확인하세요.",
                        "The team AI balance is unconfirmed. Review AI usage.",
                      )}
                </p>
                <p className="text-xs leading-5 text-muted">
                  {c(
                    "내 한도와 팀 잔액은 다릅니다. 실행 가능 여부와 예상 사용량은 프로젝트에서 다시 확인합니다.",
                    "Personal allowance and team balance differ. The project checks execution eligibility and estimated usage again.",
                  )}
                  {data.aiUsage && ` · ${date(data.aiUsage.sampledAt)} KST`}
                </p>
                <Link
                  href={`${base}/ai`}
                  className="inline-flex min-h-10 items-center underline underline-offset-4"
                >
                  {c("AI 사용량과 기록", "AI usage and history")}
                </Link>
              </div>
            )}
          </section>
          {readable && (
            <>
              <section
                className="space-y-4 border-b border-border pb-8"
                aria-label={c("내 프로젝트", "My projects")}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">
                    {c("내 프로젝트", "My projects")}
                  </h2>
                  <Link
                    href={`${base}/projects`}
                    className="text-sm underline underline-offset-4"
                  >
                    {c("전체 보기", "View all")}
                  </Link>
                </div>
                {data.projects.items.length ? (
                  <ul className={listClass}>
                    {data.projects.items.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={projectLink(p.id)}
                          className="flex min-h-16 flex-wrap items-center justify-between gap-3 p-4 hover:bg-card"
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">{p.name}</p>
                            <p className="mt-1 text-xs text-muted">
                              {c(...roleLabels[p.role])} ·{" "}
                              {c("최근 변경", "Updated")} {date(p.updatedAt)}{" "}
                              KST
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <VisibilityBadge visibility={p.visibility} />
                            <StateBadge state={p.state} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    {c(
                      "현재 참여한 프로젝트가 없습니다. 담당자의 프로젝트 초대를 확인하세요.",
                      "You have no current participating projects. Check for a project invitation.",
                    )}
                  </p>
                )}
                {data.projects.hasMore && (
                  <p className="text-xs text-muted">
                    {c(
                      "최근 변경된 프로젝트 일부입니다. 나머지는 전체 보기에서 확인하세요.",
                      "These are recently updated projects. View all to see the rest.",
                    )}
                  </p>
                )}
              </section>
              <section
                className="space-y-4 border-b border-border pb-8"
                aria-label={c("최근 발행", "Recently published")}
              >
                <h2 className="font-medium">
                  {c("최근 발행", "Recently published")}
                </h2>
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
                          className="block min-h-16 p-4 hover:bg-card"
                        >
                          <p className="break-words text-sm font-medium">
                            {p.title}
                          </p>
                          <p className="mt-1 break-words text-xs text-muted tabular-nums">
                            {p.projectName} · V{p.ordinal} ·{" "}
                            {c("회차", "Round")} {p.round} ·{" "}
                            {date(p.publishedAt)} KST
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    {c(
                      "지금 볼 수 있는 발행 영상이 없습니다. 내부 구성원에게는 검토본이 준비되면 표시되고, 외부 참여자는 담당자가 회차에 추가하거나 공유 링크를 보낼 때만 봅니다.",
                      "No published videos you can open yet. Internal members see results once their review copy is ready; external participants see them only when the lead adds them to the round or sends a share link.",
                    )}
                  </p>
                )}
                {data.recentPublications.hasMore && (
                  <p className="text-xs text-muted">
                    {c(
                      "최근 발행 일부입니다. 나머지는 각 프로젝트의 영상 검토에서 확인하세요.",
                      "These are the latest publications. Open a project's reviews for the rest.",
                    )}
                  </p>
                )}
              </section>
              <section
                className="space-y-5 border-b border-border pb-8"
                aria-label={c(
                  "전송·AI·납품 업무",
                  "Transfer, AI and delivery work",
                )}
              >
                <h2 className="font-medium">
                  {c("전송·AI·납품 업무", "Transfer, AI and delivery work")}
                </h2>
                <p className="text-xs leading-5 text-muted">
                  {c(
                    "내 전송과 AI 실행, 현재 권한으로 열 수 있는 납품 업무만 표시합니다. 각 목록은 최근 항목 일부입니다.",
                    "Only your transfers, AI runs and currently accessible deliveries appear. Each list shows recent items.",
                  )}
                </p>
                <WorkList
                  title={c("내 원본 전송", "My source transfers")}
                  empty={c(
                    "진행 중이거나 확인이 필요한 원본 전송이 없습니다.",
                    "No source transfer is in progress or needs attention.",
                  )}
                  more={data.transfers.hasMore}
                >
                  {data.transfers.items.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={projectLink(t.projectId, "/files")}
                        className="block min-h-16 p-4 hover:bg-card"
                      >
                        <p className="break-words text-sm font-medium">
                          {t.name}
                        </p>
                        <p className="mt-1 break-words text-xs text-muted">
                          {t.projectName} ·{" "}
                          {transfers[t.state]
                            ? c(...transfers[t.state])
                            : t.state}
                        </p>
                      </Link>
                    </li>
                  ))}
                </WorkList>
                <p className="text-xs leading-5 text-muted">
                  {c(
                    "전송 재개는 원본이 있는 장치에서 확인하세요. 서버 검증이 끝나야 등록된 원본으로 사용할 수 있습니다.",
                    "Resume transfers on the device holding the source. Registration requires completed server verification.",
                  )}
                </p>
                <WorkList
                  title={c("내 AI 실행", "My AI runs")}
                  empty={c(
                    "현재 열 수 있는 내 AI 실행이 없습니다.",
                    "No accessible AI run belongs to you.",
                  )}
                  more={data.aiJobs.hasMore}
                >
                  {data.aiJobs.items.map((j) => (
                    <li key={j.id}>
                      <Link
                        href={projectLink(
                          j.projectId,
                          `/ai?jobId=${encodeURIComponent(j.id)}`,
                        )}
                        className="block min-h-16 p-4 hover:bg-card"
                      >
                        <p className="break-words text-sm font-medium">
                          {j.projectName} ·{" "}
                          {j.operation === "transcript"
                            ? c("음성 전사", "Transcription")
                            : j.operation === "vision"
                              ? c("영상 분석", "Video analysis")
                              : c("에이전트 작업", "Agent task")}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {jobs[j.state] ? c(...jobs[j.state]) : j.state} ·{" "}
                          {date(j.acceptedAt)} KST
                        </p>
                      </Link>
                    </li>
                  ))}
                </WorkList>
                <WorkList
                  title={c("납품 업무", "Delivery work")}
                  empty={c(
                    "현재 열 수 있는 납품 업무가 없습니다.",
                    "No current delivery work is accessible.",
                  )}
                  more={data.deliveries.hasMore}
                >
                  {data.deliveries.items.map((d) => (
                    <li key={d.projectId}>
                      <Link
                        href={projectLink(d.projectId, "/delivery")}
                        className="block min-h-16 p-4 hover:bg-card"
                      >
                        <p className="break-words text-sm font-medium">
                          {d.projectName}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {c(deliveries[d.state][0], deliveries[d.state][1])}
                        </p>
                      </Link>
                    </li>
                  ))}
                </WorkList>
              </section>
            </>
          )}
          <p className="text-xs text-muted">
            {c("홈 확인 시각", "Home checked")}: {date(data.serverTime)} KST{" "}
            {busy && c("· 갱신 중", "· refreshing")}
          </p>
        </>
      )}
      {status.allowedActions.projects && (
        <>
          <RequestWorkPanel />
          <ReviewWorkPanel />
        </>
      )}
    </TeamShell>
  );
}
function WorkList({
  title,
  empty,
  more,
  children,
}: {
  title: string;
  empty: string;
  more: boolean;
  children: React.ReactNode[];
}) {
  const c = useCopy();
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {children.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {children}
        </ul>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
      {more && (
        <p className="text-xs text-muted">
          {c(
            "더 많은 항목이 있습니다. 해당 프로젝트에서 전체 기록을 확인하세요.",
            "More items exist. Open the project for its full history.",
          )}
        </p>
      )}
    </div>
  );
}
