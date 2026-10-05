"use client";
import Link from "next/link";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  SpaceBadge,
  TeamLoading,
  TeamShell,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bError, StateBadge, useCopy } from "./shared";

export function TeamStatus() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  if (!b2b) return <TeamLoading />;
  if (!b2b.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  const end = b2b.team.periodEndsAt ? new Date(b2b.team.periodEndsAt) : null;
  const display = (date: Date) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "long",
      timeStyle: "long",
    }).format(date);
  return (
    <TeamShell title={c("이용 상태", "Team status")}>
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={data.workspace} />
        <StateBadge state={b2b.team.currentState} />
      </div>
      {end ? (
        <dl className="space-y-6 text-sm">
          <div>
            <dt className="text-muted">
              {c("이용 종료 시각", "Exclusive period end")}
            </dt>
            <dd className="mt-2 tabular-nums">{display(end)}</dd>
          </div>
          <div>
            <dt className="text-muted">
              {c("복구 보관 시작", "Recovery storage starts")}
            </dt>
            <dd className="mt-2 tabular-nums">
              {display(new Date(end.getTime() + 30 * 86400000))}
            </dd>
          </div>
          <div>
            <dt className="text-muted">
              {c("삭제 후보 시각", "Eligible for deletion")}
            </dt>
            <dd className="mt-2 tabular-nums">
              {display(new Date(end.getTime() + 60 * 86400000))}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {c(
            "아직 이용기간이 없습니다. 첫 구매가 반영되기 전에는 만료·삭제 일정을 만들지 않습니다.",
            "No period has started. Expiry and deletion dates are set after the first purchase is applied.",
          )}
        </p>
      )}
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {c(
          "종료 시각부터 30일 미만은 열람과 다운로드만, 이후 60일 미만은 복구 보관입니다. 복구 보관 중에는 미디어를 열 수 없습니다.",
          "Reading and downloading remain available for less than 30 days after expiry. Recovery storage runs until day 60 and blocks media access.",
        )}
      </p>
      {b2b.allowedActions.billing && (
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${data.workspace.id}/plan`}
        >
          {c("플랜과 결제", "Plan and billing")}
        </Link>
      )}
    </TeamShell>
  );
}
