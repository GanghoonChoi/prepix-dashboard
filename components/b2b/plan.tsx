"use client";
import type { B2bStatus } from "@/lib/api/services/b2b.service";
import { SpaceBadge, TeamShell } from "@/components/workspaces/shared";
import { B2bError, StateBadge, useCopy } from "./shared";

export function B2bPlan({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy();
  if (!status.allowedActions.billing)
    return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")}>
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={workspace} />
        <StateBadge state={status.team.currentState} />
      </div>
      <section className="space-y-3 border-b border-border pb-8">
        <h2 className="font-medium">{c("팀 이용기간", "Team period")}</h2>
        <p className="text-sm leading-6 text-muted">
          {status.team.periodEndsAt
            ? new Intl.DateTimeFormat("ko-KR", {
                timeZone: "Asia/Seoul",
                dateStyle: "long",
                timeStyle: "long",
              }).format(new Date(status.team.periodEndsAt))
            : c(
                "첫 구매 반영 전입니다. 이용기간과 편집 이용권은 아직 지급되지 않았습니다.",
                "The first purchase has not been applied. No period or editing licences have been granted.",
              )}
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="font-medium">{c("팀 상품", "Team product")}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {c(
            "현재 팀 상품 판매가 열리지 않았습니다. 상품과 제공량 설정이 확인된 뒤 구매할 수 있습니다.",
            "Team sales are not open yet. Purchasing becomes available after the product and allowance settings are verified.",
          )}
        </p>
        <p className="text-sm leading-6 text-muted">
          {c(
            "팀 참여와 웹 검토에는 편집 이용권을 배정하지 않습니다. 편집 이용권은 팀 앱 편집과 팀 AI에 사용합니다.",
            "Team participation and web review do not allocate editing licences. Team desktop editing and team AI require them.",
          )}
        </p>
      </section>
    </TeamShell>
  );
}
