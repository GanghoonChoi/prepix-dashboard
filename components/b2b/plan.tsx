"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { BusinessCheckout } from "./business-checkout";
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
import {
  Block,
  secondaryClass,
  SpaceBadge,
  TeamShell,
} from "@/components/workspaces/shared";
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
  const view = billing.billing;
  // Unpaid (never bought) or lapsed: the checkout; a running team pays for
  // new members on People and renews by itself.
  const lapsed = ["read_only", "recovery", "deletion_due"].includes(status.team.currentState);
  const target = !status.team.periodEndsAt ? "initial" : lapsed ? "restore" : null;
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")} tabs={billingTabs(workspace.id, c)}>
      <RenewalConsentCard billing={billing} />
      <Block
        title={c("팀 이용기간", "Team period")}
        description={
          status.team.periodEndsAt
            ? c(`${kst(status.team.periodEndsAt)}까지`, `Until ${kst(status.team.periodEndsAt)}`)
            : c("아직 구매한 기간이 없습니다.", "No period purchased yet.")
        }
        actions={<StateBadge state={status.team.currentState} />}
      />
      {/* The space is named where the money goes, not in a row of its own. */}
      <Block
        title={c("Business 플랜", "Business plan")}
        description={c(
          "뷰어를 뺀 멤버마다 좌석 하나, 매월 자동결제됩니다. 뷰어는 무료입니다.",
          "One seat per member but viewers, charged monthly. Viewers are free.",
        )}
        actions={<SpaceBadge workspace={workspace} />}
      >
        {target ? (
          <Suspense>
            <BusinessCheckout workspaceId={workspace.id} target={target} billing={billing} />
          </Suspense>
        ) : (
          <p className="text-[13px] leading-5 text-muted">
            {c(
              "멤버를 추가하면 멤버 화면에서 이번 달 남은 기간만큼 바로 결제하고, 다음 달부터 함께 갱신됩니다.",
              "Adding a member is paid on People for the rest of this month, then renews with the team.",
            )}{" "}
            <Link className="text-foreground underline underline-offset-4" href={`/dashboard/workspaces/${workspace.id}/members`}>
              {c("멤버로 이동", "Go to People")}
            </Link>
          </p>
        )}
      </Block>
      {/* No orders yet is the absence of this section, not a heading over "none". */}
      {(failure || (orders && orders.items.length > 0)) && (
        <Block title={c("주문과 결제", "Orders and payments")}>
          {failure && <BillingError code={failure} />}
          {orders && orders.items.length > 0 && (
            <ul className="divide-y divide-border border-y border-border">
              {orders.items.map((o) => (
                <li key={o.id}>
                  <Link
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground"
                    href={`/dashboard/workspaces/${workspace.id}/plan/orders/${o.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium tabular-nums">{won(o.amounts.totalKrw)}</span>
                      <span className="block text-[13px] text-muted">{kst(o.createdAt)}</span>
                    </span>
                    <span className="text-[13px] text-muted">
                      {c(...orderLabels[o.state])}
                      {o.refund && ` · ${c(...refundLabels[o.refund.state])}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Block>
      )}
      {/* Edited on the 결제 정보 tab; here only the summary. */}
      <Block
        title={c("결제 정보와 갱신", "Billing and renewal")}
        description={
          view
            ? [
                view.renewal.mode === "automatic"
                  ? c("매월 자동결제", "Monthly automatic payment")
                  : c("한 달 단건", "One month at a time"),
                view.methods.some((m) => m.state === "active")
                  ? c("자동결제 카드 등록됨", "Card registered")
                  : c("등록 카드 없음", "No card"),
                view.profile
                  ? c("사업자 정보 저장됨", "Business details saved")
                  : c("사업자 정보 없음", "No business details"),
              ].join(" · ")
            : undefined
        }
        actions={
          <Link className={secondaryClass} href={`/dashboard/workspaces/${workspace.id}/plan/settings`}>
            {c("관리", "Manage")}
          </Link>
        }
      >
        {!view && billing.error && (
          <BillingError code={billing.error} retry={() => void billing.reload()} />
        )}
      </Block>
      {/* Last on purpose: the destructive action sits below everything a
          customer comes here to do. */}
      <TeamTermination workspaceId={workspace.id} status={status} billing={billing} />
    </TeamShell>
  );
}
