"use client";

import { useEffect, useState } from "react";
import { subscriptionService, type DemoStorageMode } from "@/lib/api/services/subscription.service";
import { cardClass, Select } from "@/components/ui";
import { useCopy } from "./shared";

/**
 * 클라우드 추가결제 for the card company's review login (backend
 * PAYMENTS_DEMO_ACCOUNTS): how much, then 일반결제 or 정기결제 — one click
 * each to our real pay page, which says the rest before the money. Nothing
 * is charged. Everyone else gets nothing here: the server decides, so the
 * list never ships to the browser.
 */
export function DemoStorage({ workspaceId }: { workspaceId: string }) {
  const c = useCopy();
  const [pack, setPack] = useState<{ bytes: number; supplyKrw: number } | null>(null);
  const [packs, setPacks] = useState(1);
  const [busy, setBusy] = useState<DemoStorageMode | null>(null);
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
  const open = async (mode: DemoStorageMode) => {
    setBusy(mode);
    setFailed(false);
    try {
      const { checkoutUrl } = await subscriptionService.demoCheckout(workspaceId, packs, mode);
      window.location.assign(checkoutUrl);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  const choice =
    "rounded-lg border border-border p-3 text-left transition-colors hover:border-foreground/40 hover:bg-surface disabled:opacity-50";

  return (
    <section className={`${cardClass} border-dashed p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{c("클라우드 저장공간 추가", "Add cloud storage")}</h2>
          <p className="mt-1 text-[13px] text-muted">
            {failed
              ? c("결제 페이지를 열지 못했어요. 다시 시도해 주세요.", "Could not open the checkout. Try again.")
              : c(
                  `100GB당 월 ₩${pack.supplyKrw.toLocaleString("ko-KR")} (VAT 별도) · 데모라 실제로 결제되지 않아요`,
                  `₩${pack.supplyKrw.toLocaleString("ko-KR")} per 100GB a month (VAT extra) · demo, nothing is charged`,
                )}
          </p>
        </div>
        <Select
          aria-label={c("추가할 용량", "Storage to add")}
          size="sm"
          wrapperClassName="w-28"
          value={packs}
          disabled={!!busy}
          onChange={(e) => setPacks(Number(e.target.value))}
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {size(n)}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(
          [
            ["once", c("일반결제", "One-time"), c("이번 이용기간에만 용량이 필요하면", "Only for this period")],
            ["monthly", c("정기결제", "Monthly"), c("앞으로 매달 늘어난 용량을 유지하려면", "Keep it every month")],
          ] as const
        ).map(([mode, name, desc]) => (
          <button key={mode} type="button" className={choice} disabled={!!busy} onClick={() => void open(mode)}>
            <span className="block text-sm font-medium">{busy === mode ? c("여는 중…", "Opening…") : name}</span>
            <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
