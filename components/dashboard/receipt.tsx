"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Printer } from "lucide-react";
import { Badge, buttonClass } from "@/components/ui";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { PLAN_NAMES } from "@/lib/constants/data";
import { subscriptionService, type SubscriptionReceipt } from "@/lib/api/services/subscription.service";
import { openPgReceipt, paymentStatus } from "./payment-history";

/**
 * Prepix's own receipt for one payment (2026-10-13): what was bought, for which
 * period, paid how, and who issued it — no verification step, printable to
 * PDF. The card company's slip stays one click away; this is not that slip,
 * and not a tax invoice, and it says so.
 */
export function Receipt({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [receipt, setReceipt] = useState<SubscriptionReceipt | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    subscriptionService
      .receipt(id)
      .then((r) => live && setReceipt(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  const back = (
    <Link href="/dashboard/plan/payments" className={buttonClass({ variant: "ghost", size: "sm" })}>
      <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
      {c("결제내역", "Payment history")}
    </Link>
  );
  if (failed)
    return (
      <div className="mx-auto max-w-[680px] space-y-4 py-10">
        {back}
        <p className="text-sm text-muted">{c("영수증을 찾을 수 없어요.", "This receipt could not be found.")}</p>
      </div>
    );
  if (!receipt) return <div className="mx-auto h-96 max-w-[680px] animate-pulse rounded-xl bg-surface-secondary" />;

  const r = receipt;
  const status = paymentStatus[r.status];
  const at = (iso: string) => `${formatDate(iso, lang)} ${formatTime(iso, lang)}`;
  const item = `Prepix ${PLAN_NAMES[r.plan] ?? r.plan} ${r.interval === "year" ? c("연간 구독", "annual subscription") : c("월간 구독", "monthly subscription")}`;
  const method =
    r.method === "kakaopay"
      ? [c("카카오페이", "KakaoPay"), r.cardCompany, r.cardNumber].filter(Boolean).join(" · ")
      : [r.cardCompany ? `${r.cardCompany}${c("카드", " card")}` : c("카드", "Card"), r.cardNumber].filter(Boolean).join(" · ");
  const rows: [string, string][] = [
    [c("영수증 번호", "Receipt no."), r.receiptNo],
    [c("결제일시", "Paid at"), at(r.paidAt)],
    [c("결제수단", "Payment method"), method],
    ...(r.approvalNo ? [[c("승인번호", "Approval no."), r.approvalNo] as [string, string]] : []),
    [c("구매자", "Billed to"), r.buyer.email],
  ];

  return (
    <div className="mx-auto max-w-[680px] space-y-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {back}
        <div className="flex gap-2">
          {r.hasPgReceipt && (
            <button type="button" onClick={() => void openPgReceipt(r.id)} className={buttonClass({ variant: "secondary", size: "sm" })}>
              {c("카드 매출전표", "Card slip")}
              <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={() => window.print()} className={buttonClass({ variant: "primary", size: "sm" })}>
            <Printer size={14} strokeWidth={1.75} aria-hidden="true" />
            {c("인쇄 · PDF 저장", "Print · Save PDF")}
          </button>
        </div>
      </div>

      <article id="receipt" className="rounded-2xl border border-border bg-background p-8 sm:p-10" aria-label={c("영수증", "Receipt")}>
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[13px] font-extrabold tracking-[0.08em]">PREPIX</p>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight">{c("영수증", "Receipt")}</h1>
            <p className="mt-1 text-[13px] text-muted">{r.receiptNo}</p>
          </div>
          <Badge tone={status.tone} dot>
            {c(status.ko, status.en)}
          </Badge>
        </header>

        <div className="mt-8 border-y border-border py-6">
          <p className="text-[13px] text-muted">{at(r.paidAt)}</p>
          <p className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight ${r.status === "cancelled" ? "text-muted line-through" : ""}`}>
            {formatMoney(r.amount, lang)}
          </p>
          {r.status !== "paid" && r.cancelledAt && (
            <p className="mt-2 text-[13px] text-danger-ink">
              {c(
                `${formatDate(r.cancelledAt, lang)}에 ${formatMoney(r.cancelledAmount, lang)} 환불되었습니다.`,
                `${formatMoney(r.cancelledAmount, lang)} refunded on ${formatDate(r.cancelledAt, lang)}.`,
              )}
            </p>
          )}
        </div>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <div>
              <p className="font-medium">{item}</p>
              {r.periodStart && r.periodEnd && (
                <p className="mt-0.5 text-[13px] text-muted">
                  {c("이용기간", "Period")} {formatDate(r.periodStart, lang)} – {formatDate(r.periodEnd, lang)}
                </p>
              )}
            </div>
            <p className="tabular-nums">{formatMoney(r.amount, lang)}</p>
          </div>
          <dl className="mt-5 space-y-1.5 border-t border-dashed border-border pt-4 text-[13px] tabular-nums">
            <div className="flex justify-between">
              <dt className="text-muted">{c("공급가액", "Subtotal")}</dt>
              <dd>{formatMoney(r.supplyAmount, lang)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{c("부가세", "VAT")}</dt>
              <dd>{formatMoney(r.vatAmount, lang)}</dd>
            </div>
            <div className="flex justify-between pt-1 text-sm font-semibold">
              <dt>{c("합계", "Total")}</dt>
              <dd>{formatMoney(r.amount, lang)}</dd>
            </div>
            {r.cancelledAmount > 0 && (
              <div className="flex justify-between text-danger-ink">
                <dt>{c("환불", "Refunded")}</dt>
                <dd>-{formatMoney(r.cancelledAmount, lang)}</dd>
              </div>
            )}
          </dl>
        </section>

        <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-all">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="mt-8 rounded-xl bg-surface-secondary/60 p-4 text-[12px] leading-5 text-muted">
          <p className="font-medium text-foreground">{c("공급자", "Issued by")}</p>
          <p className="mt-1">
            {r.merchant.name} · {c("대표", "CEO")} {r.merchant.representative} · {c("사업자등록번호", "Business no.")} {r.merchant.businessNo}
          </p>
          <p>{r.merchant.address}</p>
          <p>
            {r.merchant.phone} · {r.merchant.email}
          </p>
        </section>

        <p className="mt-6 text-[11px] leading-4 text-muted">
          {c(
            "이 영수증은 Prepix가 발행한 결제 확인서이며 카드 매출전표나 세금계산서가 아닙니다. 카드 매출전표는 결제사에서 확인할 수 있어요.",
            "This receipt is Prepix's confirmation of payment; it is not a card company slip or a tax invoice. The card slip is available from the payment provider.",
          )}
        </p>
      </article>

      {/* Printing gives the receipt the whole page and nothing else. */}
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #receipt, #receipt * { visibility: visible !important; }
        #receipt { position: absolute; left: 0; top: 0; width: 100%; border: 0; }
      }`}</style>
    </div>
  );
}
