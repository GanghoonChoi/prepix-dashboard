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
  orderTones,
  refundLabels,
  refundTones,
  targetLabels,
  useTeamBilling,
  useWon,
} from "./billing-shared";
import type { B2bStatus } from "@/lib/api/services/b2b.service";
import { SpaceBadge, TeamShell } from "@/components/workspaces/shared";
import {
  Badge,
  buttonClass,
  numClass,
  SettingsSection,
  StatStrip,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { B2bError, StateBadge, useCopy } from "./shared";

export function B2bPlan({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy();
  const won = useWon();
  const { lang } = useI18n();
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
  const card = view?.methods.find((m) => m.state === "active");
  const ends = status.team.periodEndsAt;
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")} tabs={billingTabs(workspace.id, c)}>
      <RenewalConsentCard billing={billing} />
      {/* Only figures this page already holds; seats live on People. */}
      <StatStrip
        items={[
          { label: c("플랜", "Plan"), value: "Business", foot: <StateBadge state={status.team.currentState} /> },
          {
            label: c("팀 이용기간", "Team period"),
            // The exact instant, not a day: the period end is exclusive.
            value: ends ? (
              <span className="text-base">{c(`${kst(ends)}까지`, `Until ${kst(ends)}`)}</span>
            ) : (
              "—"
            ),
            foot: ends ? undefined : c("아직 구매한 기간이 없습니다.", "No period purchased yet."),
          },
          {
            label: c("결제수단", "Payment method"),
            value: view ? (
              card ? (
                <span className="font-mono text-base">{card.cardNumberMasked ?? c("카드 정보 없음", "No card")}</span>
              ) : (
                <span className="text-base">{c("등록 카드 없음", "No card")}</span>
              )
            ) : (
              "—"
            ),
          },
        ]}
      />
      {/* The space is named where the money goes, not in a row of its own. */}
      <SettingsSection
        title={c("Business 플랜", "Business plan")}
        description={c(
          "뷰어를 뺀 멤버마다 좌석 하나, 매월 자동결제됩니다. 뷰어는 무료입니다.",
          "One seat per member but viewers, charged monthly. Viewers are free.",
        )}
        action={<SpaceBadge workspace={workspace} />}
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
      </SettingsSection>
      {/* No orders yet is the absence of this section, not a heading over "none". */}
      {(failure || (orders && orders.items.length > 0)) && (
        <SettingsSection title={c("주문과 결제", "Orders and payments")}>
          {failure && <BillingError code={failure} />}
          {orders && orders.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>{c("내용", "Item")}</th>
                    <th className={thClass}>{c("날짜", "Date")}</th>
                    <th className={`${thClass} ${numClass}`}>{c("금액", "Amount")}</th>
                    <th className={thClass}>{c("상태", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.items.map((o) => (
                    // The link stretches over the row, so the whole row opens the order.
                    <tr key={o.id} className="relative transition-colors hover:bg-surface focus-within:bg-surface">
                      <td className={`${tdClass} font-medium`}>
                        <Link
                          className="whitespace-nowrap after:absolute after:inset-0 focus-visible:outline-none"
                          href={`/dashboard/workspaces/${workspace.id}/plan/orders/${o.id}`}
                        >
                          {c(...(targetLabels[o.target] ?? [o.target, o.target]))}
                        </Link>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap tabular-nums text-muted`}>{formatDate(o.createdAt, lang)}</td>
                      <td className={`${tdClass} ${numClass} whitespace-nowrap`}>{won(o.amounts.totalKrw)}</td>
                      <td className={tdClass}>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={orderTones[o.state]} dot={orderTones[o.state] !== "neutral"}>
                            {c(...orderLabels[o.state])}
                          </Badge>
                          {o.refund && (
                            <Badge tone={refundTones[o.refund.state]} dot={refundTones[o.refund.state] !== "neutral"}>
                              {c(...refundLabels[o.refund.state])}
                            </Badge>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SettingsSection>
      )}
      {/* Edited on the 결제 정보 tab; here only the summary. */}
      <SettingsSection
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
        action={
          <Link className={buttonClass({ variant: "secondary", size: "sm" })} href={`/dashboard/workspaces/${workspace.id}/plan/settings`}>
            {c("관리", "Manage")}
          </Link>
        }
      >
        {!view && billing.error && (
          <BillingError code={billing.error} retry={() => void billing.reload()} />
        )}
      </SettingsSection>
      {/* Last on purpose: the destructive action sits below everything a
          customer comes here to do. */}
      <TeamTermination workspaceId={workspace.id} status={status} billing={billing} />
    </TeamShell>
  );
}
