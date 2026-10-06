"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  b2bService,
  type TeamAiJobList,
  type TeamAiUsageOverview,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  ConfirmDialog,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

type Job = TeamAiJobList["jobs"][number];
const states: Record<Job["state"], [string, string]> = {
  queued: ["접수됨", "Queued"],
  running: ["처리 중", "Running"],
  cancel_requested: ["취소 처리 중", "Cancellation pending"],
  completed: ["완료", "Completed"],
  failed: ["실패 · 예약 반환", "Failed · reservation returned"],
  cancelled: ["취소 완료", "Cancelled"],
  timed_out: ["시간 초과 · 예약 반환", "Timed out · reservation returned"],
};
const operations: Record<Job["operation"], [string, string]> = {
  transcript: ["음성 전사", "Transcription"],
  vision: ["영상 분석", "Video analysis"],
  agent: ["에이전트 작업", "Agent task"],
};
const instant = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function TeamAiUsage() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const scope = `${data.workspace.id}:${data.currentUserId ?? ""}`;
  const workspaceId = data.workspace.id;
  const [cursor, setCursor] = useState<string | undefined>();
  const [loaded, setLoaded] = useState<{
    scope: string;
    cursor?: string;
    usage: TeamAiUsageOverview;
    history: TeamAiJobList;
  } | null>(null);
  const [failure, setFailure] = useState<{
    scope: string;
    code: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const readable = !!b2b?.enrolled && b2b.allowedActions.projects;
  const load = useCallback(async () => {
    if (!readable) return;
    const call = ++sequence.current;
    setBusy(true);
    try {
      const [usage, history] = await Promise.all([
        b2bService.aiUsage(workspaceId),
        b2bService.aiJobs(workspaceId, cursor),
      ]);
      if (call !== sequence.current) return;
      setLoaded({ scope, cursor, usage, history });
      setFailure(null);
    } catch (error) {
      if (call !== sequence.current) return;
      // History contains project names. A failed access refresh must remove it.
      setLoaded(null);
      setFailure({ scope, code: errorCode(error) });
    } finally {
      if (call === sequence.current) setBusy(false);
    }
  }, [workspaceId, scope, cursor, readable]);
  useEffect(() => {
    const calls = sequence;
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      calls.current++;
    };
  }, [load]);
  const view =
    loaded?.scope === scope && loaded.cursor === cursor ? loaded : null;
  const error = failure?.scope === scope ? failure.code : "";
  const count = (value: string | number) =>
    new Intl.NumberFormat(c("ko-KR", "en-US")).format(BigInt(value));
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  if (!readable)
    return (
      <TeamShell title={c("팀 AI 사용량", "Team AI usage")}>
        <SpaceBadge workspace={data.workspace} />
        <p className="text-sm leading-6 text-muted">
          {c(
            "현재 팀 상태에서는 AI 내역을 열 수 없습니다. 이용 상태를 확인해 주세요.",
            "AI history is unavailable in the current team state. Review the team status.",
          )}
        </p>
        <Link
          href={`/dashboard/workspaces/${workspaceId}/status`}
          className={secondaryClass}
        >
          {c("이용 상태", "Team status")}
        </Link>
      </TeamShell>
    );
  return (
    <TeamShell
      title={c("팀 AI 사용량", "Team AI usage")}
      description={c(
        "이 팀의 공동 사용량과 내 작업을 확인합니다. 개인 한도는 팀 잔액을 사용할 수 있는 상한입니다.",
        "Review this team's shared usage and your jobs. A personal limit caps how much of the team balance you can use.",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpaceBadge workspace={data.workspace} />
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void load()}
        >
          {c("최신 상태 확인", "Refresh")}
        </button>
      </div>
      {error && <B2bError code={error} retry={() => void load()} />}
      {error && cursor && (
        <button className={secondaryClass} onClick={() => setCursor(undefined)}>
          {c("최근 내역", "Latest jobs")}
        </button>
      )}
      {!view ? (
        !error && <TeamLoading />
      ) : (
        <>
          {!view.usage.reconciled && (
            <B2bError code="B2B_AI_ACCOUNTING_REVIEW_REQUIRED" />
          )}
          <Block
            title={c("팀 공동 사용량", "Shared team usage")}
            description={c(
              "확정·반환·만료는 누적 기록입니다. 반환량은 원래 지급 건에 기록되며, 만료된 양은 사용 가능량에 더하지 않습니다.",
              "Confirmed, returned and expired amounts are cumulative records. Returns stay on the original grant; expired units do not become available again.",
            )}
          >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
              {[
                [
                  c("사용 가능", "Available"),
                  view.usage.reconciled && view.usage.availableUnits !== null
                    ? count(view.usage.availableUnits)
                    : c("확인 필요", "Needs review"),
                ],
                [c("예약 중", "Reserved"), count(view.usage.reservedUnits)],
                [c("사용 확정", "Confirmed"), count(view.usage.confirmedUnits)],
                [c("예약 반환", "Returned"), count(view.usage.returnedUnits)],
                [c("만료", "Expired"), count(view.usage.expiredUnits)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-muted">{label}</dt>
                  <dd className="mt-2 text-2xl font-medium tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-muted">
              {c(
                "AI 사용량 단위 · 한국 시간 확인",
                "AI usage units · checked in Korea time",
              )}{" "}
              {instant(view.usage.serverTime)}
            </p>
          </Block>
          <Block
            title={c("내 기간별 한도", "My limits by period")}
            description={c(
              "한도 변경이나 이용권 재배정은 팀 AI를 새로 지급하지 않습니다. 새 실행에는 해당 팀의 유효한 편집 이용권이 필요합니다.",
              "Changing a limit or reassigning a licence does not grant new AI units. New jobs require a valid editing licence in this team.",
            )}
          >
            {view.usage.personalBudgets.length === 0 ? (
              <p className="text-sm text-muted">
                {c(
                  "배정된 기간별 한도가 없습니다.",
                  "No personal period limits are assigned.",
                )}
              </p>
            ) : (
              <div className="space-y-4">
                {view.usage.personalBudgets.map((budget) => {
                  const now = Date.parse(view.usage.serverTime);
                  const active =
                    Date.parse(budget.startsAt) <= now &&
                    now < Date.parse(budget.endsAt);
                  return (
                    <div
                      key={budget.periodId}
                      className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0"
                    >
                      <p className="text-sm tabular-nums">
                        {instant(budget.startsAt)} ~ {instant(budget.endsAt)}{" "}
                        {c("미만", "exclusive")}
                      </p>
                      <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
                        <div>
                          <dt className="inline text-muted">
                            {c("한도", "Limit")}{" "}
                          </dt>
                          <dd className="inline">{count(budget.limitUnits)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">
                            {c("사용 확정", "Confirmed")}{" "}
                          </dt>
                          <dd className="inline">
                            {count(budget.confirmedUnits)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">
                            {c("예약 중", "Reserved")}{" "}
                          </dt>
                          <dd className="inline">
                            {count(budget.reservedUnits)}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline text-muted">
                            {c("잔여 한도", "Remaining limit")}{" "}
                          </dt>
                          <dd className="inline">
                            {!view.usage.reconciled
                              ? c("확인 필요", "Needs review")
                              : active
                                ? count(
                                    budget.limitUnits -
                                      budget.confirmedUnits -
                                      budget.reservedUnits,
                                  )
                                : now < Date.parse(budget.startsAt)
                                  ? c("다음 기간", "Future period")
                                  : c("기간 종료", "Ended")}
                          </dd>
                        </div>
                      </dl>
                      <p className="text-xs leading-5 text-muted">
                        {budget.unitLabel} · {budget.unitDescription}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            <Link
              className={secondaryClass}
              href={`/dashboard/workspaces/${workspaceId}/licences`}
            >
              {c("편집 이용권 확인", "Review editing licence")}
            </Link>
          </Block>
          <Block
            title={c("내 AI 작업", "My AI jobs")}
            description={c(
              "현재 접근할 수 있는 프로젝트의 내 작업만 표시합니다. 결과 수신과 발행에는 현재 자료 권한을 다시 확인합니다.",
              "Only your jobs in currently accessible projects appear here. Receiving and publishing results requires current content access.",
            )}
          >
            {view.history.jobs.length === 0 ? (
              <p className="text-sm text-muted">
                {c("표시할 AI 작업이 없습니다.", "No AI jobs to display.")}
              </p>
            ) : (
              <div className="space-y-6">
                {view.history.jobs.map((job) => (
                  <AiJobRow
                    key={`${scope}:${job.id}`}
                    job={job}
                    reconciled={view.usage.reconciled}
                    onChanged={load}
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {cursor && (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => setCursor(undefined)}
                >
                  {c("최근 내역", "Latest jobs")}
                </button>
              )}
              {view.history.nextCursor && (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => setCursor(view.history.nextCursor!)}
                >
                  {c("이전 내역", "Older jobs")}
                </button>
              )}
            </div>
          </Block>
        </>
      )}
    </TeamShell>
  );
}

function AiJobRow({
  job,
  reconciled,
  onChanged,
}: { job: Job; reconciled: boolean; onChanged: () => Promise<void> }) {
  const c = useCopy();
  const count = (value: number) =>
    new Intl.NumberFormat(c("ko-KR", "en-US")).format(value);
  const request = useRef<string | null>(null);
  const tries = useRef<object>({});
  const flight = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const cancel = async () => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    request.current ??= crypto.randomUUID();
    try {
      await b2bService.cancelAiJob(
        job.workspaceId,
        job.projectId,
        job.id,
        request.current,
      );
      request.current = null;
      tries.current = {};
      setUnknown(false);
      setConfirm(false);
      await onChanged();
    } catch (error) {
      setError(errorCode(error));
      const rejected = freeIntent(tries.current, error);
      setUnknown(!rejected);
      if (rejected) {
        request.current = null;
        tries.current = {};
        await onChanged();
      }
    } finally {
      flight.current = false;
      setBusy(false);
    }
  };
  return (
    <article
      aria-label={`${job.projectName} ${c(...operations[job.operation])}`}
      className="space-y-3 border-b border-border pb-6 last:border-0 last:pb-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/dashboard/workspaces/${job.workspaceId}/projects/${job.projectId}`}
            className="text-sm font-medium underline underline-offset-4"
          >
            {job.projectName}
          </Link>
          <p className="mt-1 text-sm text-muted">
            {c(...operations[job.operation])} · {c(...states[job.state])}
          </p>
        </div>
        {reconciled &&
          (["queued", "running"].includes(job.state) || unknown) &&
          !confirm && (
            <button className={secondaryClass} onClick={() => setConfirm(true)}>
              {c(
                unknown ? "취소 결과 확인" : "작업 취소",
                unknown ? "Check cancellation" : "Cancel job",
              )}
            </button>
          )}
      </div>
      <p className="text-xs tabular-nums text-muted">
        {c("접수", "Accepted")} {instant(job.acceptedAt)} ·{" "}
        {c("처리 종료 시각", "Processing deadline")} {instant(job.deadline)}
      </p>
      <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm tabular-nums">
        {[
          [c("예상량", "Estimate"), job.estimatedUnits],
          [c("승인 최대량", "Approved maximum"), job.maximumUnits],
          [c("예약 중", "Reserved"), job.reservedUnits],
          [c("사용 확정", "Confirmed"), job.confirmedUnits],
          [c("예약 반환", "Returned"), job.returnedUnits],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="inline text-muted">{label} </dt>
            <dd className="inline">{count(value as number)}</dd>
          </div>
        ))}
      </dl>
      {job.state === "cancel_requested" && (
        <p role="status" className="text-sm text-muted">
          {c(
            "취소 요청을 접수했습니다. 완료된 단계와 반환량을 확인하는 중입니다.",
            "Cancellation is pending. Completed steps and returned units are being checked.",
          )}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          label={c("AI 작업 취소 확인", "Confirm AI job cancellation")}
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p className="text-sm leading-6">
            {c(
              "대기 중인 작업은 예약 전부를 반환합니다. 실행 중인 작업은 승인한 최대량 안에서 이미 제공된 완료 단계만 정산하고 나머지를 반환합니다.",
              "Queued jobs return the full reservation. Running jobs settle only delivered, completed steps within the approved maximum and return the rest.",
            )}
          </p>
          {error && <B2bError code={error} />}
          {unknown && (
            <p role="status" className="text-sm text-muted">
              {c(
                "취소 결과를 아직 확인하지 못했습니다. 같은 요청으로 다시 확인합니다.",
                "The cancellation outcome is unknown. Check the same request again.",
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={busy || !reconciled}
              onClick={() => void cancel()}
            >
              {c(
                unknown ? "같은 취소 다시 확인" : "취소 요청",
                unknown ? "Check same cancellation" : "Request cancellation",
              )}
            </button>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              {c("닫기", "Close")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </article>
  );
}
