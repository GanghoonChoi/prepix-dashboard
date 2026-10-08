"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UseOverlayStateReturn } from "@heroui/react";
import { apiClient } from "@/lib/api/client";
import { b2bService, type TeamOrder, type TeamQuote } from "@/lib/api/services/b2b.service";
import { billingApi } from "@/lib/b2b-billing/operations";
import { Dialog } from "@/components/dialog";
import { primaryClass, secondaryClass } from "@/components/workspaces/shared";
import { useI18n } from "@/lib/i18n/context";
import { billingCode, BillingError, won } from "./billing-shared";
import { useCopy } from "./shared";

const settled: TeamOrder["state"][] = ["applied", "canceled", "expired", "review_required"];

/**
 * 멤버 = 결제 (2026-10-08): members waiting for a seat get one now. The rest
 * of this period is charged at once to the card on automatic renewal; from
 * the next payment the renewal bills every member but viewers.
 */
export function AddSeats({
  state,
  workspaceId,
  userId,
  count,
  onDone,
}: {
  state: UseOverlayStateReturn;
  workspaceId: string;
  userId: string | null;
  count: number;
  onDone: () => void;
}) {
  const c = useCopy();
  const { lang } = useI18n();
  const [quote, setQuote] = useState<TeamQuote | null>(null);
  const [card, setCard] = useState("");
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const requestKey = useRef("");
  const open = state.isOpen;
  const api = () =>
    billingApi({ origin: new URL(apiClient.defaults.baseURL!).origin, userId, workspaceId });

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(async () => {
      setQuote(null);
      setError("");
      try {
        const [billing, commerce] = await Promise.all([api().overview(), api().commerce()]);
        const method = billing.methods.find((m) => m.id === billing.renewal.methodId && m.state === "active");
        if (billing.renewal.mode !== "automatic" || !method) throw new Error("B2B_AUTOPAY_REQUIRED");
        const period = commerce.configured ? commerce.currentPeriod : null;
        if (!period?.product) throw new Error("B2B_QUOTE_PERIOD_CHANGED");
        const result = await b2bService.purchaseQuote(workspaceId, {
          requestKey: crypto.randomUUID(),
          productVersion: period.product.version,
          target: "current",
          renewal: "automatic",
          sourcePeriodId: period.id,
          extraSeats: count,
          aiPacks: 0,
          storagePacks: 0,
        });
        if (!alive) return;
        requestKey.current = crypto.randomUUID();
        setCard(method.cardNumberMasked ?? "");
        setQuote(result.quote);
      } catch (e) {
        if (alive) setError(billingCode(e));
      }
    }, 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // api() is rebuilt from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, userId, count]);

  const pay = async () => {
    if (!quote || paying) return;
    setPaying(true);
    setError("");
    try {
      let { order } = await api().charge({ requestKey: requestKey.current, quoteId: quote.id });
      // The server applies paid seats within seconds.
      for (let i = 0; i < 40 && !settled.includes(order.state); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        order = (await api().order(order.id)).order;
      }
      if (order.state === "applied") {
        onDone();
        state.close();
        return;
      }
      setQuote(null);
      setError(order.state === "canceled" ? "B2B_SEAT_CHARGE_DECLINED" : "B2B_SEAT_CHARGE_PENDING");
    } catch (e) {
      setError(billingCode(e));
    } finally {
      setPaying(false);
    }
  };

  const ends = quote?.period.endsAt
    ? new Date(Date.parse(quote.period.endsAt) - 1).toLocaleDateString(lang, { month: "long", day: "numeric" })
    : "";
  return (
    <Dialog state={state} title={c(`좌석 ${count}개 추가`, `Add ${count} seat${count > 1 ? "s" : ""}`)}>
      <div className="space-y-4" data-testid="add-seats">
        {error && <BillingError code={error} />}
        {!quote && !error && <p className="text-sm text-muted">{c("금액을 계산하는 중…", "Calculating…")}</p>}
        {quote && (
          <>
            <dl className="divide-y divide-border rounded-xl border border-border text-sm">
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">{c("기간", "Period")}</dt>
                <dd>{c(`오늘부터 ${ends}까지`, `Today to ${ends}`)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 px-4 py-3">
                <dt className="text-muted">{c("결제 카드", "Card")}</dt>
                <dd className="tabular-nums">{card}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-4 py-3">
                <dt className="text-muted">{c("지금 결제 (VAT 포함)", "Charged now (VAT incl.)")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{won(quote.amounts.totalKrw)}</dd>
              </div>
            </dl>
            <p className="text-xs leading-5 text-muted">
              {c(
                "이번 달은 남은 기간만큼만 결제됩니다. 다음 결제일부터는 뷰어를 뺀 멤버 수만큼 자동 결제됩니다.",
                "This month is charged for the days left. From the next payment, renewal bills every member but viewers.",
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primaryClass} disabled={paying} onClick={() => void pay()}>
                {paying ? c("결제하는 중…", "Paying…") : c(`${won(quote.amounts.totalKrw)} 결제`, `Pay ${won(quote.amounts.totalKrw)}`)}
              </button>
              <button type="button" className={secondaryClass} disabled={paying} onClick={state.close}>
                {c("취소", "Cancel")}
              </button>
            </div>
          </>
        )}
        {error === "B2B_AUTOPAY_REQUIRED" && (
          <Link className={primaryClass} href={`/dashboard/workspaces/${workspaceId}/plan`}>
            {c("플랜으로 이동", "Go to plan")}
          </Link>
        )}
      </div>
    </Dialog>
  );
}
