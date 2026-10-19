"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Skeleton } from "@heroui/react";
import { Badge, EmptyState, buttonClass, tableClass, tdClass, thClass } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { PLAN_NAMES } from "@/lib/constants/data";
import {
  subscriptionService,
  type SubscriptionPayment,
} from "@/lib/api/services/subscription.service";

export const paymentStatus = {
  paid: { ko: "결제완료", en: "Paid", tone: "success" },
  partial_cancelled: { ko: "부분취소", en: "Partly refunded", tone: "warning" },
  cancelled: { ko: "취소완료", en: "Refunded", tone: "danger" },
} as const;

/**
 * Opens the card company's slip in a new tab. The tab is opened on the click
 * itself (a window opened after an await is a blocked popup) and pointed at
 * the slip once the server has checked it is this account's.
 */
export async function openPgReceipt(id: string) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const { url } = await subscriptionService.pgReceipt(id);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch {
    tab?.close();
  }
}

/**
 * 플랜과 결제's two tabs (2026-10-19): the plan, and 결제내역 on its own page,
 * as billing pages split them on Vercel and Slack — the plan cards and a year
 * of payments were too much for one page.
 */
export function planTabs(t: (key: string) => string) {
  return [
    { href: "/dashboard/plan", label: t("plan.tabPlan") },
    { href: "/dashboard/plan/payments", label: t("plan.tabPayments"), match: "/dashboard/plan/receipts" },
  ];
}

/**
 * 결제내역 (2026-10-13): every payment of the personal plan, newest first, with
 * Prepix's own receipt and the card company's slip.
 */
export function PaymentHistory() {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [rows, setRows] = useState<SubscriptionPayment[] | null>(null);

  useEffect(() => {
    let live = true;
    subscriptionService
      .payments()
      .then((p) => live && setRows(p))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);

  if (!rows) return <Skeleton className="h-40 w-full rounded-md" />;
  if (!rows.length) return <EmptyState title={c("아직 결제내역이 없어요", "No payments yet")} />;
  const toss = rows.some((r) => r.provider === "tosspayments" && r.hasPgReceipt);
  return (
    <section aria-label={c("결제내역", "Payment history")}>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>{c("결제일", "Date")}</th>
              <th className={thClass}>{c("항목", "Item")}</th>
              <th className={`${thClass} text-right`}>{c("금액", "Amount")}</th>
              <th className={thClass}>{c("상태", "Status")}</th>
              <th className={`${thClass} text-right`}>{c("증빙", "Receipts")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = paymentStatus[r.status];
              return (
                <tr key={r.id} data-payment={r.receiptNo}>
                  <td className={`${tdClass} whitespace-nowrap tabular-nums`}>{formatDate(r.paidAt, lang)}</td>
                  <td className={tdClass}>
                    <div className="whitespace-nowrap">
                      Prepix {PLAN_NAMES[r.plan] ?? r.plan} ·{" "}
                      {r.kind === "upgrade" ? c("업그레이드 차액", "Upgrade difference") : r.interval === "year" ? c("연간", "Annual") : c("월간", "Monthly")}
                    </div>
                    <div className="text-xs text-muted">
                      {r.method === "kakaopay" ? c("카카오페이", "KakaoPay") : c("카드", "Card")}
                      {r.approvalNo && ` · ${c("승인번호", "Approval")} ${r.approvalNo}`}
                    </div>
                  </td>
                  <td className={`${tdClass} text-right tabular-nums`}>
                    <div className={r.status === "cancelled" ? "text-muted line-through" : ""}>{formatMoney(r.amount, lang)}</div>
                    {r.status === "partial_cancelled" && (
                      <div className="text-xs text-muted">
                        {c("환불", "Refunded")} {formatMoney(r.cancelledAmount, lang)}
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    <Badge tone={status.tone} dot>
                      {c(status.ko, status.en)}
                    </Badge>
                  </td>
                  <td className={`${tdClass} text-right`}>
                    <div className="flex justify-end gap-1.5">
                      <Link href={`/dashboard/plan/receipts/${r.id}`} className={buttonClass({ variant: "secondary", size: "xs" })}>
                        {c("영수증", "Receipt")}
                      </Link>
                      {r.hasPgReceipt && (
                        <button
                          type="button"
                          onClick={() => void openPgReceipt(r.id)}
                          className={buttonClass({ variant: "ghost", size: "xs" })}
                          title={r.provider === "tosspayments" ? c("토스페이먼츠에서 본인 확인 후 열려요", "Opens at Toss Payments after a quick check") : undefined}
                        >
                          {c("카드 매출전표", "Card slip")}
                          <ExternalLink size={12} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {toss && (
        <p className="mt-3 text-xs leading-5 text-muted">
          {c(
            "카드 결제의 매출전표는 토스페이먼츠에서 열리며 본인 확인이 필요할 수 있어요. 승인번호·결제일·금액이나 결제 이메일로 확인할 수 있어요.",
            "Card slips open at Toss Payments, which may ask you to confirm the payment: use the approval number, date and amount, or your email.",
          )}
        </p>
      )}
    </section>
  );
}
