"use client";

import { useEffect, useState } from "react";
import { subscriptionService } from "@/lib/api/services/subscription.service";
import { Button, cardClass } from "@/components/ui";
import { useCopy } from "./shared";

/**
 * 클라우드 추가결제 for the card company's review login (backend
 * PAYMENTS_DEMO_ACCOUNTS): our real pay page at www.prepix.ai's price
 * (100GB 월 5,800원, VAT 별도, no proration), nothing charged. Everyone else gets nothing here — the server decides, so
 * the list never ships to the browser. Live storage packs have no payment
 * route yet, so there is no non-demo twin of this card.
 */
export function DemoStorage({ workspaceId }: { workspaceId: string }) {
  const c = useCopy();
  const [pack, setPack] = useState<{ bytes: number; supplyKrw: number } | null>(null);
  const [packs, setPacks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void subscriptionService
      .demo()
      .then((r) => setPack(r.available ? r.storagePack : null))
      .catch(() => undefined);
  }, []);
  if (!pack) return null;

  const size = (n: number) => {
    const gb = (n * pack.bytes) / 1e9;
    return gb >= 1000 ? `${gb / 1000}TB` : `${gb}GB`;
  };
  const open = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { checkoutUrl } = await subscriptionService.demoCheckout(workspaceId, packs);
      window.location.assign(checkoutUrl);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4 border-dashed p-5`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{c("클라우드 저장 공간 추가", "Add cloud storage")}</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {failed
            ? c("결제 페이지를 열지 못했어요. 다시 시도해 주세요.", "Could not open the checkout. Try again.")
            : c(
                `${size(1)}당 월 ₩${pack.supplyKrw.toLocaleString("ko-KR")} (VAT 별도) · Business 정기 결제일에 함께 갱신 · 데모라 실제로 결제되지 않아요`,
                `KRW ${pack.supplyKrw.toLocaleString("ko-KR")} per ${size(1)} a month (VAT extra) · renews with Business · demo, nothing is charged`,
              )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <select
          aria-label={c("추가할 용량", "Storage to add")}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={packs}
          onChange={(e) => setPacks(Number(e.target.value))}
          disabled={busy}
        >
          {[1, 5, 10].map((n) => (
            <option key={n} value={n}>
              {size(n)}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={busy} aria-busy={busy} onClick={() => void open()}>
          {busy ? c("여는 중…", "Opening…") : c("결제하기", "Checkout")}
        </Button>
      </div>
    </section>
  );
}
