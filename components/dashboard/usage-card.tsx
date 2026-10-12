"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { useI18n } from "@/lib/i18n/context";
import { Button, Meter, Notice } from "@/components/ui";
import { formatDay, formatDuration } from "@/lib/format";

/**
 * 사용량 inside the plan card: how much AI time is left of what the plan
 * gives. One figure — the video count was a number nobody acted on.
 */
export function UsageSection() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [usage, setUsage] = useState<Record<string, Record<string, number | string>> | null>(null);

  const loadUsage = () => {
    setLoading(true);
    setLoadError(false);
    usageService.getUsage()
      .then(setUsage)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  // Load usage on mount. loadUsage() sets state via its promise callbacks.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadUsage(); }, []);

  const quota = usage?.inferenceQuota;
  // Coupon time is already inside total/remaining; this just says how much of
  // it there is and when the soonest of it lapses, so it is not a surprise.
  const bonus = (usage as { bonus?: { remainingSeconds: number; nextExpiresAt: number | null } } | null)?.bonus;
  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const unlimited = total < 0;
  // Nothing left reads 0분, not "1분 미만".
  const duration = (seconds: number) => formatDuration(Math.max(0, seconds), lang);
  const foot = [
    quota && !unlimited ? t("usage.usedAmount", { amount: duration(Number(quota.used ?? 0)) }) : null,
    bonus && bonus.remainingSeconds > 0
      ? t("coupon.usageBonus", {
          minutes: String(Math.floor(bonus.remainingSeconds / 60)),
          date: bonus.nextExpiresAt ? formatDay(new Date(bonus.nextExpiresAt), lang) : "—",
        })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (loading) return <Skeleton className="h-12 rounded-md" />;
  if (loadError)
    return (
      <Notice
        tone="danger"
        action={
          <Button variant="secondary" size="sm" onClick={loadUsage}>
            {t("common.retry")}
          </Button>
        }
      >
        {t("usage.loadError")}
      </Notice>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-[13px]">
        <span className="text-muted">{t("usage.timeLeft")}</span>
        <span className="font-medium tabular-nums">
          {unlimited
            ? t("usage.unlimited")
            : quota
              ? `${duration(remaining)} ${t("usage.ofTotal", { total: duration(total) })}`
              : "—"}
        </span>
      </div>
      {/* Time LEFT: a full bar is good news, so it never turns amber. */}
      {!unlimited && <Meter value={total > 0 ? (remaining / total) * 100 : 100} tone="neutral" />}
      {foot && <p className="text-xs text-muted">{foot}</p>}
    </div>
  );
}
