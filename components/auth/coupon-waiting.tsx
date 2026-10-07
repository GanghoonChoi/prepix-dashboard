"use client";

import { Ticket } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

/**
 * Said on sign-in and sign-up when the person arrived from a coupon link, so
 * a form standing between them and the coupon reads as a step, not a detour.
 */
export function CouponWaiting({ returnTo }: { returnTo?: string }) {
  const { t } = useI18n();
  if (!returnTo || !/[?&]coupon=/.test(returnTo)) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-4 py-3 text-sm text-foreground">
      <Ticket size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
      {t("coupon.authBanner")}
    </div>
  );
}
