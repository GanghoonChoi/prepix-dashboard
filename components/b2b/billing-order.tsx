"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  BackLink,
  Block,
  Details,
  inputClass,
  KeyValues,
  Notice,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import type {
  TeamOrder,
  TeamRefundPreview,
  TeamRefundSelection,
} from "@/lib/api/services/b2b.service";
import { checkRecord, runRecord, type BillingRecord } from "@/lib/b2b-billing/operations";
import { checkPgReturn, clearPgIntent, readPgIntent } from "@/lib/b2b-billing/pg-return";
import {
  BillingError,
  billingCode,
  kst,
  openPaymentWindow,
  orderLabels,
  refundLabels,
  useTeamBilling,
  won,
} from "./billing-shared";
import { useCopy } from "./shared";

const settling = ["payment_unknown", "received", "applying"];
const targets: Record<string, [string, string]> = {
  initial: ["첫 한 달", "First month"],
  current: ["현재 기간 추가", "Added to current period"],
  next: ["다음 한 달", "Next month"],
  restore: ["복구 후 한 달", "Month after restoration"],
};

/** S23: one original order. A browser return never decides payment; the server
 * confirms against the provider and this page only shows what it recorded. */
export function BillingOrder({ workspaceId, orderId }: { workspaceId: string; orderId: string }) {
  const c = useCopy();
  const params = useSearchParams();
  const { scope, api, store, error, reload } = useTeamBilling(workspaceId);
  const [order, setOrder] = useState<TeamOrder | null>(null);
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState("");
  const [method, setMethod] = useState<"카드" | "계좌이체">("카드");
  const [selection, setSelection] = useState<TeamRefundSelection>({ base: false, extraSeats: 0, aiPacks: 0, storagePacks: 0 });
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<TeamRefundPreview | null>(null);
  const [pendingRefund, setPendingRefund] = useState<BillingRecord | null>(null);
  const serial = useRef(0),
    confirming = useRef(false),
    viewGeneration = useRef(0);
  useEffect(() => {
    const generation = ++viewGeneration.current;
    confirming.current = false;
    return () => { viewGeneration.current = generation + 1; };
  }, [api, orderId]);
  const load = useCallback(async () => {
    if (!api) return;
    const call = ++serial.current;
    try {
      const next = (await api.order(orderId)).order;
      if (call === serial.current) {
        setOrder(next);
        setFailure("");
      }
    } catch (e) {
      // Lost access or a failed read hides the order; it never reads as unpaid.
      if (call === serial.current) {
        setOrder(null);
        setFailure(billingCode(e));
      }
    }
  }, [api, orderId]);
  useEffect(() => {
    setOrder(null);
    setPreview(null);
    setBusy("");
    const t = setTimeout(() => void load(), 0);
    if (scope)
      void store
        .get({ scope, action: "refund", topic: orderId })
        .then(setPendingRefund)
        .catch((e) => setFailure(billingCode(e)));
    return () => clearTimeout(t);
  }, [load, scope, store, orderId]);
  useEffect(() => {
    if (!order || !settling.includes(order.state)) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [order, load]);
  const pg = params.get("pg");
  // Payment-window return: only the matching order and server amount confirm.
  useEffect(() => {
    if (!api || !order || pg !== "success" || confirming.current) return;
    const paymentKey = params.get("paymentKey"),
      returned = params.get("orderId"),
      amount = Number(params.get("amount"));
    if (order.state !== "awaiting_payment" && order.state !== "payment_unknown") {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    // Only the flow this service, account and team started may confirm.
    if (!scope) return;
    const verdict = checkPgReturn(
      readPgIntent(order.providerOrderId),
      scope,
      { id: order.id, providerOrderId: order.providerOrderId, amount: order.quote.amounts.totalKrw },
      { orderId: returned, amount },
    );
    if (!paymentKey || verdict !== "ok") {
      setFailure(verdict === "scope_mismatch" ? "B2B_PG_RETURN_SCOPE_MISMATCH" : "B2B_PG_RETURN_MISMATCH");
      return;
    }
    const generation = viewGeneration.current;
    const path = window.location.pathname;
    const current = () => {
      if (viewGeneration.current !== generation || window.location.pathname !== path) return false;
      try { api.assertScope(); return true; } catch { return false; }
    };
    confirming.current = true;
    setBusy("confirm");
    void api
      .confirm(orderId, paymentKey)
      .then((r) => {
        if (!current()) return;
        setOrder(r.order);
        clearPgIntent(order.providerOrderId);
        window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((e) => { if (current()) setFailure(billingCode(e)); })
      .finally(() => {
        if (viewGeneration.current === generation) confirming.current = false;
        if (current()) setBusy("");
      });
  }, [api, order, pg, params, orderId, scope]);
  if (!order)
    return failure || error ? (
      <BillingError code={failure || error} retry={() => void (api ? load() : reload())} />
    ) : (
      <TeamLoading />
    );
  const label = orderLabels[order.state];
  const remaining = {
    extraSeats: order.quote.selection.extraSeats - order.refunds.filter((r) => r.state === "refunded").reduce((n, r) => n + (r.selection?.extraSeats ?? 0), 0),
    aiPacks: order.quote.selection.aiPacks - order.refunds.filter((r) => r.state === "refunded").reduce((n, r) => n + (r.selection?.aiPacks ?? 0), 0),
    storagePacks: order.quote.selection.storagePacks - order.refunds.filter((r) => r.state === "refunded").reduce((n, r) => n + (r.selection?.storagePacks ?? 0), 0),
  };
  const refundable = (["extraSeats", "aiPacks", "storagePacks"] as const).filter((k) => remaining[k] > 0);
  const canBase = order.quote.target === "next" && !order.refunds.some((r) => r.state === "refunded" && r.selection?.base);
  const openRefund = order.refunds.some((r) => ["reserved", "cancelling", "provider_unknown", "review_required"].includes(r.state));
  const requestRefund = async (record: BillingRecord<"refund">) => {
    if (!api || !scope) return;
    setBusy("refund");
    setFailure("");
    try {
      await runRecord(record, api, store);
      setPreview(null);
      await load();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy("");
      setPendingRefund(await store.get({ scope, action: "refund", topic: orderId }).catch(() => null));
    }
  };
  const facts: [string, ReactNode][] = [
    [
      c("구매 대상", "Purchase"),
      `${c(...(targets[order.quote.target] ?? [order.quote.target, order.quote.target]))} · ${order.kind === "billing" ? c("자동결제", "Automatic") : c("단건", "One-off")}`,
    ],
    [
      c("결제 금액", "Amount"),
      <span key="amount" className="tabular-nums">
        {won(order.quote.amounts.totalKrw)}{" "}
        <span className="text-muted">
          ({c("공급가액", "supply")} {won(order.quote.amounts.supplyKrw)} · {c("부가세", "VAT")} {won(order.quote.amounts.vatKrw)})
        </span>
      </span>,
    ],
    [
      c("대상 기간", "Period"),
      order.application && order.appliedPeriod
        ? `${kst(order.application.effectiveAt)} — ${kst(order.appliedPeriod.endsAt)}`
        : order.quote.period.startsAt && order.quote.period.endsAt
          ? `${kst(order.quote.period.startsAt)} — ${kst(order.quote.period.endsAt)}`
          : c("실제 반영 시각부터 한 달", "One month from actual application"),
    ],
  ];
  // The expiry only matters while the order can still be paid (or just lapsed).
  if (order.state === "awaiting_payment" || order.state === "expired")
    facts.push([c("주문 유효 시각", "Order expires"), kst(order.expiresAt)]);
  if (order.receipt)
    facts.push([c("수납 확인", "Receipt"), `${won(order.receipt.amountKrw)} · ${kst(order.receipt.approvedAt)}`]);
  if (order.application && order.application.overpaymentKrw > 0)
    facts.push([c("반영 지연 차액 (원결제로 반환)", "Late-application difference (returned to payment)"), won(order.application.overpaymentKrw)]);
  if (order.failureCode) facts.push([c("결제사 응답 코드", "Provider code"), order.failureCode]);
  const showRefunds = order.state === "applied" || order.refunds.length > 0 || !!pendingRefund;
  return (
    <TeamShell title={c("결제 결과", "Payment result")}>
      <BackLink href={`/dashboard/workspaces/${workspaceId}/plan`}>
        {c("플랜과 결제로 돌아가기", "Back to plan and billing")}
      </BackLink>
      <section aria-label={c("주문 상태", "Order state")} className="space-y-5 border-b border-border pb-8 last:border-b-0 last:pb-0">
        <div className="space-y-1">
          <p className="text-lg font-medium" role="status">
            {c(...label)}
          </p>
          {order.state === "payment_unknown" && (
            <p className="text-[13px] leading-5 text-muted">
              {c("결제사 결과를 확인하고 있습니다. 같은 결제를 다시 시도하지 마세요. 확인되면 자동으로 반영합니다.", "We are checking with the payment provider. Do not pay again; this updates automatically.")}
            </p>
          )}
          {order.state === "received" && (
            <p className="text-[13px] leading-5 text-muted">
              {c("결제가 확인되었습니다. 이용권과 제공량을 반영하는 중이며 다시 결제할 필요가 없습니다.", "Payment is confirmed. Licences and allowances are being applied; no further payment is needed.")}
            </p>
          )}
          {order.state === "applied" && (
            <Link
              className="text-[13px] text-foreground underline underline-offset-4"
              href={`/start?step=app&workspace=${workspaceId}`}
            >
              {c("다음: 앱 설치하고 첫 편집", "Next: install the app")}
            </Link>
          )}
          {order.state === "review_required" && (
            <p className="text-[13px] leading-5 text-muted">
              {c("결제 또는 반영을 운영자가 확인하고 있습니다. 같은 기간을 다시 결제하지 마세요.", "Operations is reviewing this payment or application. Do not pay for the same period again.")}
            </p>
          )}
        </div>
        {pg === "fail" && order.state === "awaiting_payment" && (
          <Notice role="status">
            {c("결제를 완료하지 않았습니다. 결제나 지급은 일어나지 않았습니다.", "Payment was not completed. Nothing was charged or granted.")}
          </Notice>
        )}
        {failure && <BillingError code={failure} retry={() => void load()} />}
        {order.kind === "checkout" && order.state === "awaiting_payment" && pg !== "success" && (
          <div className="flex flex-wrap items-end gap-3">
            {order.quote && (
              <label className="block space-y-2 text-sm">
                <span>{c("결제 수단", "Method")}</span>
                <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as "카드" | "계좌이체")}>
                  <option value="카드">{c("카드", "Card")}</option>
                  <option value="계좌이체">{c("계좌이체", "Bank transfer")}</option>
                </select>
              </label>
            )}
            <button
              type="button"
              className={primaryClass}
              disabled={!!busy}
              onClick={async () => {
                if (!api || !scope) return;
                setBusy("checkout");
                try {
                  const checkout = await api.checkout(orderId);
                  if (!checkout.methods.includes(method)) throw new Error("B2B_PAYMENT_NOT_CONFIGURED");
                  const back = `${window.location.origin}/dashboard/workspaces/${workspaceId}/plan/orders/${orderId}`;
                  await openPaymentWindow({
                    client: checkout.client,
                    orderId: checkout.providerOrderId,
                    orderName: checkout.orderName,
                    amount: checkout.amount,
                    method,
                    successUrl: `${back}?pg=success`,
                    failUrl: `${back}?pg=fail`,
                    intent: { scope: scope!, orderId, providerOrderId: checkout.providerOrderId, amount: checkout.amount },
                  });
                } catch (e) {
                  setFailure(billingCode(e));
                  setBusy("");
                }
              }}
            >
              {c("결제하기", "Pay")} · {won(order.quote.amounts.totalKrw)}
            </button>
          </div>
        )}
        {pg === "success" && order.state === "payment_unknown" && (
          <button type="button" className={secondaryClass} disabled={!!busy} onClick={() => window.location.reload()}>
            {c("결제 결과 다시 확인", "Check payment again")}
          </button>
        )}
        {settling.includes(order.state) && (
          <button type="button" className={secondaryClass} onClick={() => void load()}>
            {c("진행 상태 다시 확인", "Check progress again")}
          </button>
        )}
        <KeyValues items={facts} />
      </section>
      {showRefunds && (
        <Block
          title={c("환불", "Refunds")}
          description={c("이 주문에서 쓰지 않은 부분만 환불할 수 있습니다.", "Only the unused part of this order can be refunded.")}
        >
          {order.refunds.length > 0 && (
            <ul className="divide-y divide-border border-y border-border text-sm">
              {order.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3" data-refund-state={r.state}>
                  <span className="min-w-0">
                    <span className="block font-medium">{c(...refundLabels[r.state])}</span>
                    <span className="block text-[13px] text-muted">
                      {c("기준 시각", "Measured at")} {kst(r.basisAt)}
                      {r.refundedAt && ` · ${c("환불 확인", "Refunded")} ${kst(r.refundedAt)}`}
                    </span>
                  </span>
                  <span className="tabular-nums">{won(r.amounts.totalKrw)}</span>
                </li>
              ))}
            </ul>
          )}
          {pendingRefund && (
            <div className="space-y-3 text-[13px] leading-5">
              <Notice>{c("환불 요청 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인합니다.", "The refund request has no confirmed result. The original request is checked.")}</Notice>
              <button
                type="button"
                className={secondaryClass}
                disabled={!!busy}
                onClick={async () => {
                  if (!api) return;
                  setBusy("refund");
                  try {
                    if (!(await checkRecord(pendingRefund, api, store))) await runRecord(pendingRefund, api, store);
                    await load();
                  } catch (e) {
                    setFailure(billingCode(e));
                  } finally {
                    setBusy("");
                    setPendingRefund(scope ? await store.get({ scope, action: "refund", topic: orderId }).catch(() => null) : null);
                  }
                }}
              >
                {c("환불 요청 결과 확인", "Confirm refund request")}
              </button>
            </div>
          )}
          {order.state === "applied" && !openRefund && !pendingRefund && (refundable.length === 0 && !canBase ? (
            <p className="text-[13px] text-muted">
              {c(
                "이 주문에는 따로 환불할 추가 항목이 없습니다. 진행 중인 기간은 플랜과 결제의 중도해지로 환불합니다.",
                "This order has no add-on items to refund. A running period is refunded through termination on plan and billing.",
              )}
            </p>
          ) : (
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!api) return;
                setBusy("preview");
                setFailure("");
                try {
                  setPreview(await api.refundPreview(orderId, selection));
                } catch (err) {
                  setPreview(null);
                  setFailure(billingCode(err));
                } finally {
                  setBusy("");
                }
              }}
            >
              {refundable.map((key) => (
                <label key={key} className="block space-y-2 text-sm">
                  <span>
                    {key === "extraSeats" ? c("환불할 추가 이용권", "Licences to refund") : key === "aiPacks" ? c("환불할 AI 팩", "AI packs to refund") : c("환불할 저장 팩", "Storage packs to refund")}
                  </span>
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={remaining[key]}
                    value={selection[key]}
                    disabled={!!busy}
                    onChange={(e) => {
                      setPreview(null);
                      setSelection({ ...selection, [key]: Number(e.target.value) });
                    }}
                  />
                </label>
              ))}
              {canBase && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selection.base}
                    onChange={(e) => {
                      setPreview(null);
                      setSelection(e.target.checked ? { base: true, ...remaining } : { ...selection, base: false });
                    }}
                  />
                  <span>{c("시작 전 선구매 기간 전체", "The whole prepaid month (before it starts)")}</span>
                </label>
              )}
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span>{c("환불 사유", "Reason")}</span>
                <input className={inputClass} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-3 sm:col-span-2">
                <button className={secondaryClass} disabled={!!busy}>
                  {c("환불 금액 확인", "Check refund amount")}
                </button>
                {preview && (
                  <button
                    type="button"
                    className={primaryClass}
                    disabled={!!busy || !reason.trim()}
                    onClick={() =>
                      scope &&
                      void requestRefund({
                        schema: 1,
                        scope,
                        action: "refund",
                        topic: orderId,
                        attempts: 0,
                        input: {
                          requestKey: crypto.randomUUID(),
                          orderId,
                          selection,
                          reason: reason.trim(),
                          expectedTotalKrw: preview.amounts.totalKrw,
                          // Measured at the instant shown, so seconds of drift never void it.
                          basisAt: preview.basisAt,
                        },
                      })
                    }
                  >
                    {c("환불 요청", "Request refund")} · {won(preview.amounts.totalKrw)}
                  </button>
                )}
              </div>
              {preview && (
                <p className="text-[13px] leading-5 text-muted sm:col-span-2" role="status">
                  {c("공급가액", "Supply")} {won(preview.amounts.supplyKrw)} · {c("부가세", "VAT")} {won(preview.amounts.vatKrw)} · {c("이용권", "Licences")} {preview.allowances.seats} · {c("기준 시각", "Measured at")} {kst(preview.basisAt)}
                </p>
              )}
            </form>
          ))}
          <Details>
            {c(
              "요청하면 미사용분을 먼저 예약하고, 운영자 확인 뒤 원결제를 취소합니다. 배정 해제나 자동결제 중지는 환불이 아닙니다.",
              "A request reserves the unused part first; the original payment is cancelled after operations review. Unassigning or stopping renewal is not a refund.",
            )}
          </Details>
        </Block>
      )}
    </TeamShell>
  );
}
