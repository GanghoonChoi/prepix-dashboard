"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { UseOverlayStateReturn } from "@heroui/react";
import { apiClient } from "@/lib/api/client";
import { b2bService, type TeamOrder, type TeamQuote } from "@/lib/api/services/b2b.service";
import { billingApi } from "@/lib/b2b-billing/operations";
import { Dialog } from "@/components/dialog";
import { Button, buttonClass, SummaryRows } from "@/components/ui";
import { formatDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { billingCode, BillingError, useWon } from "./billing-shared";
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
  const won = useWon();
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
    ? formatDay(new Date(Date.parse(quote.period.endsAt) - 1), lang)
    : "";
  return (
    <Dialog state={state} title={c(`좌석 ${count}개 추가`, `Add ${count} seat${count > 1 ? "s" : ""}`)}>
      <div className="space-y-4" data-testid="add-seats">
        {error && <BillingError code={error} />}
        {!quote && !error && <p className="text-sm text-muted">{c("금액을 계산하는 중…", "Calculating…")}</p>}
        {quote && (
          <>
            {/* Prorated to the days left, so no "unit × seats" line: the
                quote's own supply and VAT are the breakdown. */}
            <SummaryRows
              rows={[
                [c("기간", "Period"), c(`오늘부터 ${ends}까지`, `Today to ${ends}`)],
                [c("결제 카드", "Card"), <span key="card" className="font-mono">{card}</span>],
                [c("공급가액", "Supply"), won(quote.amounts.supplyKrw)],
                [c("부가세", "VAT"), won(quote.amounts.vatKrw)],
              ]}
              total={[c("지금 결제 (VAT 포함)", "Charged now (VAT incl.)"), won(quote.amounts.totalKrw)]}
            />
            <p className="text-xs leading-5 text-muted">
              {c(
                "이번 달은 남은 기간만큼만 결제됩니다. 다음 결제일부터는 뷰어를 뺀 멤버 수만큼 자동 결제됩니다.",
                "This month is charged for the days left. From the next payment, renewal bills every member but viewers.",
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" disabled={paying} onClick={state.close}>
                {c("취소", "Cancel")}
              </Button>
              <Button disabled={paying} aria-busy={paying || undefined} onClick={() => void pay()}>
                {paying ? c("결제하는 중…", "Paying…") : c(`${won(quote.amounts.totalKrw)} 결제`, `Pay ${won(quote.amounts.totalKrw)}`)}
              </Button>
            </div>
          </>
        )}
        {error === "B2B_AUTOPAY_REQUIRED" && (
          <Link className={buttonClass()} href={`/dashboard/workspaces/${workspaceId}/plan`}>
            {c("플랜으로 이동", "Go to plan")}
          </Link>
        )}
      </div>
    </Dialog>
  );
}
