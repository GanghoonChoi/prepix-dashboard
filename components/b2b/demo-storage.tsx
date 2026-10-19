"use client";

import { useEffect, useId, useState } from "react";
import {
  subscriptionService,
  type DemoStorageMode,
  type DemoStorageTier,
} from "@/lib/api/services/subscription.service";
import { Button, cardClass, Field, Select } from "@/components/ui";
import { useCopy } from "./shared";

/**
 * 클라우드 추가결제 for the card company's review login (backend
 * PAYMENTS_DEMO_ACCOUNTS): our real pay page at www.prepix.ai's price and
 * terms, nothing charged. The admin picks what the policy says they pick —
 * 저장공간 종류, 100GB 단위 수량, 결제 방식 (일반결제 = this period only,
 * 정기결제 = renews with Business) — and the pay page says the rest before
 * the money. Everyone else gets nothing here: the server decides, so the
 * list never ships to the browser. Live storage packs have no payment route
 * yet, so there is no non-demo twin of this card.
 */
export function DemoStorage({ workspaceId }: { workspaceId: string }) {
  const c = useCopy();
  const id = useId();
  const [pack, setPack] = useState<{ bytes: number; supplyKrw: Record<DemoStorageTier, number> } | null>(null);
  const [tier, setTier] = useState<DemoStorageTier>("active");
  const [packs, setPacks] = useState(1);
  const [mode, setMode] = useState<DemoStorageMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void subscriptionService
      .demo()
      .then((r) => setPack(r.available ? r.storagePack : null))
      .catch(() => undefined);
  }, []);
  if (!pack) return null;

  const won = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
  const size = (n: number) => {
    const gb = (n * pack.bytes) / 1e9;
    return gb >= 1000 ? `${gb / 1000}TB` : `${gb}GB`;
  };
  const supply = packs * pack.supplyKrw[tier];
  const total = supply + Math.round(supply / 10);
  const open = async () => {
    if (!mode) return;
    setBusy(true);
    setFailed(false);
    try {
      const { checkoutUrl } = await subscriptionService.demoCheckout(workspaceId, packs, tier, mode);
      window.location.assign(checkoutUrl);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  const modes: [DemoStorageMode, string, string][] = [
    [
      "once",
      c("일반결제", "One-time"),
      c(
        "이번 이용기간에만 용량이 필요하면 · 다음 Business 갱신일에 종료, 자동 결제 없음",
        "Only for this period · ends at the next Business renewal, no automatic payment",
      ),
    ],
    [
      "monthly",
      c("정기결제", "Monthly"),
      c(
        "앞으로 매달 늘어난 용량을 유지하려면 · Business 정기 결제일에 함께 자동 결제",
        "Keep the extra space every month · charged with Business on its renewal date",
      ),
    ],
  ];

  return (
    <section className={`${cardClass} space-y-5 border-dashed p-5`}>
      <div>
        <h2 className="text-base font-semibold">{c("클라우드 저장공간 추가", "Add cloud storage")}</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {c(
            "100GB 단위 · VAT 별도 · 중도 구매도 월 요금 전액 · 데모라 실제로 결제되지 않아요",
            "In 100GB units · VAT extra · the whole month even mid-period · demo, nothing is charged",
          )}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c("저장공간 종류", "Storage type")} htmlFor={`${id}-tier`}>
          <Select
            id={`${id}-tier`}
            value={tier}
            disabled={busy}
            onChange={(e) => setTier(e.target.value as DemoStorageTier)}
          >
            <option value="active">
              {c("Active · 작업 중인 원본", "Active · work in progress")} · {c("100GB 월", "100GB a month")} {won(pack.supplyKrw.active)}
            </option>
            <option value="archive">
              {c("Archive · 완료한 원본 보관", "Archive · finished originals")} · {c("100GB 월", "100GB a month")} {won(pack.supplyKrw.archive)}
            </option>
          </Select>
        </Field>
        <Field label={c("수량", "Quantity")} htmlFor={`${id}-packs`}>
          <Select
            id={`${id}-packs`}
            value={packs}
            disabled={busy}
            onChange={(e) => setPacks(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {size(n)} (100GB × {n})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset disabled={busy} className="space-y-1.5">
        <legend className="mb-1.5 text-[13px] font-medium">{c("결제 방식", "Payment")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {modes.map(([value, name, desc]) => (
            <label
              key={value}
              className="flex cursor-pointer gap-3 rounded-lg border border-border p-3 transition-colors hover:border-foreground/30 has-[:checked]:border-foreground has-[:checked]:ring-1 has-[:checked]:ring-foreground"
            >
              <input
                type="radio"
                name={`${id}-mode`}
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                className="mt-0.5 accent-foreground"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{name}</span>
                <span className="mt-0.5 block text-[13px] leading-5 text-muted">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-sm">
          {failed ? (
            <span className="text-danger-ink">
              {c("결제 페이지를 열지 못했어요. 다시 시도해 주세요.", "Could not open the checkout. Try again.")}
            </span>
          ) : (
            <>
              <span className="font-semibold">{won(total)}</span>
              <span className="text-muted">
                {" "}
                {mode === "monthly" ? c("/ 월 · VAT 포함", "/ month · VAT incl.") : c("VAT 포함", "VAT incl.")}
              </span>
            </>
          )}
        </p>
        <Button disabled={busy || !mode} aria-busy={busy} onClick={() => void open()}>
          {busy ? c("여는 중…", "Opening…") : mode ? c("결제하기", "Checkout") : c("결제 방식을 고르세요", "Choose how to pay")}
        </Button>
      </div>
    </section>
  );
}
