"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  SpaceBadge,
  TeamLoading,
  TeamShell,
  secondaryClass,
} from "@/components/workspaces/shared";
import { apiClient } from "@/lib/api/client";
import { accessEnded } from "@/lib/api/session";
import { b2bService, type TeamLifecycle } from "@/lib/api/services/b2b.service";
import { useI18n } from "@/lib/i18n/context";
import { deletionCopy, kst, reasonCopy } from "@/lib/b2b-lifecycle/view";
import {
  B2bError,
  errorCode,
  StateBadge,
  useCopy,
} from "./shared";

type Scope = { origin: string; userId: string; workspaceId: string };

// S26. Keyed by account+team: a switch unmounts the old reader before any of
// its responses can paint. SOT: prepix-backend docs/b2b-team-lifecycle-deletion.md
export function TeamStatus() {
  const context = useWorkspace();
  if (!context?.b2b) return <TeamLoading />;
  if (!context.b2b.enrolled || !context.data.currentUserId)
    return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  const scope: Scope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    userId: context.data.currentUserId,
    workspaceId: context.data.workspace.id,
  };
  return <Lifecycle key={JSON.stringify(scope)} scope={scope} />;
}

function Lifecycle({ scope }: { scope: Scope }) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const [view, setView] = useState<TeamLifecycle | null>(null);
  const [error, setError] = useState("");
  const serial = useRef(0),
    mounted = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++serial.current;
    try {
      const next = await b2bService.lifecycle(scope.workspaceId, scope.userId);
      if (!mounted.current || ticket !== serial.current) return;
      setView(next);
      setError("");
    } catch (e) {
      if (!mounted.current || ticket !== serial.current) return;
      // A failed read is never shown as deleted, recoverable or empty: a
      // network failure keeps the last answer with a retry; a 4xx (the
      // server's, or this browser's own session fence) clears it.
      if (accessEnded(e)) setView(null);
      setError(errorCode(e));
    }
  }, [scope]);
  useEffect(() => {
    const counter = serial;
    mounted.current = true;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("workspaces:changed", refresh);
    return () => {
      mounted.current = false;
      counter.current++;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("workspaces:changed", refresh);
    };
  }, [load]);
  const at = (iso: string | null) => (iso ? kst(iso, lang) : "—");
  const yes = (allowed: boolean) => (allowed ? c("가능", "Allowed") : c("불가", "Not allowed"));
  return (
    <TeamShell title={c("이용 상태", "Team status")}>
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={data.workspace} />
        {view && <StateBadge state={view.currentState} />}
      </div>
      {error && <B2bError code={error} retry={() => void load()} />}
      {!view && !error && (
        <p role="status" className="text-sm text-muted">
          {c("현재 이용 상태를 확인하는 중입니다.", "Checking the current team status.")}
        </p>
      )}
      {view && (
        <div className="space-y-8" data-testid="team-lifecycle">
          {view.boundaries ? (
            <section className="space-y-3" aria-label={c("이용 일정", "Schedule")}>
              <h2 className="font-medium">{c("이용 일정", "Schedule")}</h2>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2">
                {[
                  [c("이용 종료 시각 (E)", "Period end (E)"), view.boundaries.readOnlyFrom],
                  [c("복구 보관 시작 (E+30일)", "Recovery storage from (E+30d)"), view.boundaries.recoveryFrom],
                  [
                    view.deletion.preparing
                      ? c("삭제 가능 시각 (E+60일, 시작 시각 미확정)", "Deletion allowed from (E+60d; start time not set)")
                      : c("삭제 시작 예정 (E+60일)", "Deletion from (E+60d)"),
                    view.boundaries.deletionFrom,
                  ],
                  [c("서버 기준 현재 시각", "Server time"), view.serverTime],
                ].map(([label, iso]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-muted">{label}</dt>
                    <dd className="mt-1 break-words tabular-nums">{at(iso)}</dd>
                  </div>
                ))}
              </dl>
              <p className="max-w-2xl text-pretty text-sm leading-6 text-muted">
                {c(
                  "E부터 30일 미만은 기존 권한 안의 열람과 다운로드만, 30일부터 60일 미만은 복구 보관으로 자료를 열 수 없습니다. 60일부터 삭제를 시작하며 삭제가 시작되면 복구할 수 없습니다. 안내 메일의 실패나 재발송은 이 시각을 바꾸지 않습니다.",
                  "For under 30 days from E, reading and downloading within existing access remain. From day 30 to 60, content is in recovery storage and cannot be opened. Deletion starts from day 60 and then recovery is impossible. Notification failures never move these times.",
                )}
              </p>
            </section>
          ) : (
            <p className="max-w-2xl text-pretty text-sm leading-6 text-muted">
              {c(
                "아직 이용기간이 없습니다. 첫 구매가 반영되기 전에는 종료·삭제 일정을 만들지 않습니다.",
                "No period has started. End and deletion dates exist only after the first purchase is applied.",
              )}
            </p>
          )}
          <section className="space-y-3" aria-label={c("지금 할 수 있는 일", "Allowed now")}>
            <h2 className="font-medium">{c("지금 할 수 있는 일", "Allowed now")}</h2>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              {[
                [c("자료 열람", "Open content"), view.allowedActions.openContent],
                [c("다운로드", "Download"), view.allowedActions.download],
                [c("편집·업로드·새 AI·코멘트", "Edit, upload, new AI, comments"), view.allowedActions.edit],
                ...(view.allowedActions.billing
                  ? [[c("이용 복구 구매", "Restore purchase"), view.allowedActions.restorePurchase] as const]
                  : []),
              ].map(([label, allowed]) => (
                <div key={String(label)} className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                  <dt>{label}</dt>
                  <dd className={allowed ? "" : "text-muted"}>{yes(Boolean(allowed))}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="space-y-2" aria-label={c("삭제 상태", "Deletion")}>
            <h2 className="font-medium">{c("삭제 상태", "Deletion")}</h2>
            <p className="text-sm leading-6" data-testid="deletion-state">
              {c(...deletionCopy(view))}
            </p>
            {view.deletion.startedAt && (
              <p className="text-sm text-muted tabular-nums">
                {c("삭제 시작", "Deletion started")}: {at(view.deletion.startedAt)}
              </p>
            )}
            {view.deletion.completedAt && (
              <p className="text-sm text-muted tabular-nums">
                {c("실제 삭제 완료", "Deleted at")}: {at(view.deletion.completedAt)}
              </p>
            )}
            {view.deletion.backup && (
              <p className="text-sm text-muted tabular-nums">
                {view.deletion.backup.state === "purged"
                  ? c("백업 사본 제거 확인 완료", "Backup copies verified removed")
                  : c(
                      `백업 사본 제거 기한 ${at(view.deletion.backup.dueAt)} (아직 확인되지 않음)`,
                      `Backup copies must be removed by ${at(view.deletion.backup.dueAt)} (not yet verified)`,
                    )}
              </p>
            )}
          </section>
          {view.recovery && (
            <section className="space-y-2" aria-label={c("복구 진행", "Recovery")} data-testid="recovery-detail">
              <h2 className="font-medium">{c("복구 진행", "Recovery")}</h2>
              {view.recovery.holdStartedAt && (
                <p className="text-sm tabular-nums">
                  {view.recovery.holdUsed
                    ? c(
                        `삭제 직전 30분 보류를 이미 사용했습니다 (${at(view.recovery.holdEndsAt)} 종료). 새로고침이나 새 주문으로 연장되지 않습니다.`,
                        `The one 30-minute pre-deletion hold was used (ended ${at(view.recovery.holdEndsAt)}). Refreshing or new orders do not extend it.`,
                      )
                    : c(
                        `복구 결제로 삭제가 ${at(view.recovery.holdEndsAt)}까지 한 번 보류됩니다.`,
                        `Deletion is held once until ${at(view.recovery.holdEndsAt)} for the recovery payment.`,
                      )}
                </p>
              )}
              {view.recovery.pendingOrder && (
                <p className="text-sm">
                  {c("처리 중인 주문", "Order in progress")}:{" "}
                  <span className="font-mono text-xs">{view.recovery.pendingOrder.id}</span> ·{" "}
                  {view.recovery.pendingOrder.state}
                </p>
              )}
              {view.recovery.opsCheck && (
                <p className="text-sm tabular-nums" role="status">
                  {c(...reasonCopy(view.recovery.opsCheck.reason))} ·{" "}
                  {c("확인 시작", "Since")} {at(view.recovery.opsCheck.since)}
                  {view.recovery.opsCheck.deadline &&
                    ` · ${c("확인 기한", "Check by")} ${at(view.recovery.opsCheck.deadline)}`}
                  {". "}
                  {c(
                    "같은 결제를 다시 시도하지 마세요. 확인이 끝날 때까지 삭제하지 않습니다.",
                    "Do not pay again. Nothing is deleted until this is resolved.",
                  )}
                </p>
              )}
              {!view.recovery.holdStartedAt && !view.recovery.pendingOrder && !view.recovery.opsCheck && (
                <p className="text-sm text-muted">{c("진행 중인 복구 결제가 없습니다.", "No recovery payment in progress.")}</p>
              )}
            </section>
          )}
          <div className="flex flex-wrap gap-3">
            {view.allowedActions.restorePurchase && (
              <Link className={secondaryClass} href={`/dashboard/workspaces/${scope.workspaceId}/plan`}>
                {c("이용 복구", "Restore the team")}
              </Link>
            )}
            {view.allowedActions.billing && !view.allowedActions.restorePurchase && (
              <Link className={secondaryClass} href={`/dashboard/workspaces/${scope.workspaceId}/plan`}>
                {c("플랜과 결제", "Plan and billing")}
              </Link>
            )}
            <button type="button" className={secondaryClass} onClick={() => void load()}>
              {c("다시 확인", "Check again")}
            </button>
          </div>
        </div>
      )}
    </TeamShell>
  );
}
