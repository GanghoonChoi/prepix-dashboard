"use client";
import Link from "next/link";
import type { B2bStatus } from "@/lib/api/services/b2b.service";
import {
  SpaceBadge,
  TeamShell,
  secondaryClass,
} from "@/components/workspaces/shared";
import { StateBadge, useCopy } from "./shared";

export function B2bHome({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy();
  const base = `/dashboard/workspaces/${workspace.id}`;
  const state = status.team.currentState;
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
                  "참여한 프로젝트에서 자료와 업무를 확인하세요. 웹 참여와 팀 편집 이용권은 따로 관리됩니다.",
                  "Open your participating projects. Web participation and team editing licences are managed separately.",
                )
              : state === "read_only"
                ? c(
                    "이용기간이 종료되었습니다. 기존 권한 안에서 자료 열람과 다운로드가 가능합니다.",
                    "The team period has ended. Existing access permits reading and downloading.",
                  )
                : c(
                    "팀 자료 접근이 중지된 상태입니다. 이용 상태에서 복구·삭제 일정을 확인하세요.",
                    "Access to team content is paused. Check recovery and deletion dates in team status.",
                  )}
        </p>
        <div className="flex flex-wrap gap-3">
          {status.allowedActions.projects && (
            <Link className={secondaryClass} href={`${base}/projects`}>
              {c("내 프로젝트", "My projects")}
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
    </TeamShell>
  );
}
