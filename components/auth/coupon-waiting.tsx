"use client";

import { Ticket } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { Notice } from "@/components/ui";

/**
 * Said on sign-in and sign-up when the person arrived from a coupon link, so
 * a form standing between them and the coupon reads as a step, not a detour.
 */
export function CouponWaiting({ returnTo }: { returnTo?: string }) {
  const { t } = useI18n();
  if (!returnTo || !/[?&]coupon=/.test(returnTo)) return null;
  return (
    <Notice>
      <span className="flex items-center gap-2.5 text-foreground">
        <Ticket size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        {t("coupon.authBanner")}
      </span>
    </Notice>
  );
}
