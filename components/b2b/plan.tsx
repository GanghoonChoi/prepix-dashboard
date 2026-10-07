"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PurchaseQuotes } from "./purchase-quotes";
import { RenewalConsentCard, TeamTermination } from "./billing-legal";
import type { TeamOrderList } from "@/lib/api/services/b2b.service";
import { billingTabs,
  BillingError,
  billingCode,
  kst,
  orderLabels,
  refundLabels,
  useTeamBilling,
  won,
} from "./billing-shared";
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
  const billing = useTeamBilling(workspace.id);
  const [orders, setOrders] = useState<TeamOrderList | null>(null);
  const [failure, setFailure] = useState("");
  const { api } = billing;
  useEffect(() => {
    if (!api) return;
    let live = true;
    void api
      .orders()
      .then((r) => live && (setOrders(r), setFailure("")))
      // A failed list is not "no orders".
      .catch((e) => live && (setOrders(null), setFailure(billingCode(e))));
    return () => {
      live = false;
    };
  }, [api]);
  if (!status.allowedActions.billing)
    return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")} tabs={billingTabs(workspace.id, c)}>
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={workspace} />
        <StateBadge state={status.team.currentState} />
      </div>
      <RenewalConsentCard billing={billing} />
      <section className="space-y-3 border-b border-border pb-8">
        <h2 className="font-medium">{c("팀 이용기간", "Team period")}</h2>
        <p className="text-sm leading-6 text-muted">
          {status.team.periodEndsAt
            ? c(`${kst(status.team.periodEndsAt)}까지`, `Until ${kst(status.team.periodEndsAt)}`)
            : c(
                "첫 구매 반영 전입니다. 이용기간과 편집 이용권은 아직 지급되지 않았습니다.",
                "The first purchase has not been applied. No period or editing licences have been granted.",
              )}
        </p>
      </section>
      <section className="space-y-3 border-b border-border pb-8">
        <h2 className="font-medium">{c("팀 상품", "Team product")}</h2>
        <PurchaseQuotes workspaceId={workspace.id} status={status} billing={billing} />
        <p className="text-sm leading-6 text-muted">
          {c(
            "팀 참여와 웹 검토에는 편집 이용권을 배정하지 않습니다. 편집 이용권은 팀 앱 편집에 쓰며, 개인 요금제와 같은 앱 편집·AI 한도를 포함합니다.",
            "Team participation and web review do not allocate editing licences. A licence is for team desktop editing and includes app editing and AI limits like a personal plan.",
          )}
        </p>
      </section>
      <section aria-labelledby="orders" className="space-y-3 border-b border-border pb-8">
        <h2 id="orders" className="font-medium">{c("주문과 결제", "Orders and payments")}</h2>
        {failure && <BillingError code={failure} />}
        {orders && orders.items.length === 0 && (
          <p className="text-sm text-muted">{c("아직 주문이 없습니다.", "No orders yet.")}</p>
        )}
        {orders && orders.items.length > 0 && (
          <ul className="space-y-2 text-sm">
            {orders.items.map((o) => (
              <li key={o.id}>
                <Link
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 hover:bg-surface"
                  href={`/dashboard/workspaces/${workspace.id}/plan/orders/${o.id}`}
                >
                  <span>{c(...orderLabels[o.state])}</span>
                  <span className="tabular-nums">{won(o.amounts.totalKrw)}</span>
                  <span className="text-xs text-muted">{kst(o.createdAt)}</span>
                  {o.refund && <span className="text-xs">{c(...refundLabels[o.refund.state])}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-3 border-b border-border pb-8">
        {/* Edited on the 결제 정보 tab; here only the summary. */}
        <h2 className="font-medium">{c("결제 정보와 갱신", "Billing and renewal")}</h2>
        {billing.billing ? (
          <p className="text-sm leading-6 text-muted">
            {billing.billing.renewal.mode === "automatic"
              ? c("매월 자동결제", "Monthly automatic payment")
              : c("한 달 단건", "One month at a time")}
            {" · "}
            {billing.billing.methods.some((m) => m.state === "active")
              ? c("자동결제 카드 등록됨", "Card registered")
              : c("등록 카드 없음", "No card")}
            {" · "}
            {billing.billing.profile ? c("사업자 정보 저장됨", "Business details saved") : c("사업자 정보 없음", "No business details")}
          </p>
        ) : billing.error ? (
          <BillingError code={billing.error} retry={() => void billing.reload()} />
        ) : null}
      </section>
      {/* Last on purpose: the destructive action sits below everything a
          customer comes here to do. */}
      <TeamTermination workspaceId={workspace.id} status={status} billing={billing} />
    </TeamShell>
  );
}
