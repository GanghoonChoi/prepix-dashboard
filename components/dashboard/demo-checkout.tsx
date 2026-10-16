"use client";

import { useEffect, useState } from "react";
import { subscriptionService } from "@/lib/api/services/subscription.service";
import { useI18n } from "@/lib/i18n/context";
import { Button, cardClass } from "@/components/ui";

/**
 * The card company's review login (backend PAYMENTS_DEMO_ACCOUNTS) gets a way
 * into our pay page that charges nothing. Everyone else gets nothing here —
 * the server decides, so the list never ships to the browser.
 */
export function DemoCheckout() {
  const { lang } = useI18n();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void subscriptionService
      .demo()
      .then((r) => setAvailable(r.available))
      .catch(() => undefined);
  }, []);
  if (!available) return null;

  const open = async (plan: string) => {
    setBusy(plan);
    setFailed(false);
    try {
      const { checkoutUrl } = await subscriptionService.demoCheckout(plan);
      window.location.assign(checkoutUrl);
    } catch {
      setFailed(true);
      setBusy(null);
    }
  };
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);

  return (
    <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4 border-dashed p-5`}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{c("데모 추가결제", "Demo checkout")}</h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {failed
            ? c("결제 페이지를 열지 못했어요. 다시 시도해 주세요.", "Could not open the checkout. Try again.")
            : c(
                "실제 결제 페이지에서 카드·카카오페이 결제 흐름을 확인할 수 있어요. 실제로 결제되지 않아요.",
                "Walk through the real checkout with card or KakaoPay. Nothing is charged.",
              )}
        </p>
      </div>
      <div className="flex gap-2">
        {(["light", "creator"] as const).map((plan) => (
          <Button
            key={plan}
            variant={plan === "creator" ? "primary" : "secondary"}
            size="sm"
            disabled={busy !== null}
            aria-busy={busy === plan}
            onClick={() => void open(plan)}
          >
            {busy === plan ? c("여는 중…", "Opening…") : `${plan === "light" ? "Light" : "Creator"} ${c("결제", "checkout")}`}
          </Button>
        ))}
      </div>
    </section>
  );
}
