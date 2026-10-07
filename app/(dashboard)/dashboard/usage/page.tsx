"use client";

import { useState, useEffect } from "react";
import { Skeleton, Button } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";
import { BillingHeader } from "@/components/dashboard/billing-header";
import { Meter, Stat } from "@/components/ui";

export default function UsagePage() {
  const { t, lang } = useI18n();
  usePageTitle(t("usage.title"));
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
  const videos = usage?.videos;
  // Coupon time is already inside total/remaining; this just says how much of
  // it there is and when the soonest of it lapses, so it is not a surprise.
  const bonus = (usage as { bonus?: { remainingSeconds: number; nextExpiresAt: number | null } } | null)?.bonus;
  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const unlimited = total < 0;
  const pct = total > 0 ? (remaining / total) * 100 : 100;
  // `videos.total` is the plan's monthly allowance, and the server sends -1
  // for "no limit" — printed raw that read "-1" on every Pro account.
  const allowance = Number(videos?.total ?? 0);

  // Locale-aware thousands separators for raw counts (the quota totals are
  // pre-formatted strings from the backend, so only the video counts need it).
  const formatCount = (n: number) =>
    n.toLocaleString(lang === "ko" ? "ko-KR" : "en-US");

  return (
    <div>
      <BillingHeader />

      {loadError && !loading ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm text-danger">{t("usage.loadError")}</p>
          <Button variant="outline" size="sm" onPress={loadUsage}>{t("common.retry")}</Button>
        </div>
      ) : loading ? (
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[124px] rounded-lg" />
          <Skeleton className="h-[124px] rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <Stat
            label={t("usage.timeLeft")}
            value={unlimited ? t("usage.unlimited") : String(quota?.remainingFormatted ?? "—")}
            unit={unlimited || !quota ? undefined : t("usage.ofTotal", { total: String(quota.totalFormatted) })}
          >
            <Meter value={pct} />
            <p className="mt-2">
              {[
                quota && !unlimited ? t("usage.usedAmount", { amount: String(quota.usedFormatted) }) : null,
                bonus && bonus.remainingSeconds > 0
                  ? t("coupon.usageBonus", {
                      minutes: String(Math.floor(bonus.remainingSeconds / 60)),
                      date: bonus.nextExpiresAt
                        ? new Date(bonus.nextExpiresAt).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", { month: "long", day: "numeric" })
                        : "—",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Stat>
          <Stat
            label={t("usage.videosThisMonth")}
            value={formatCount(Number(videos?.thisMonth ?? 0))}
            unit={allowance > 0 ? t("usage.ofTotal", { total: formatCount(allowance) }) : undefined}
          >
            {[
              t("usage.completedCount", { count: formatCount(Number(videos?.completed ?? 0)) }),
              Number(videos?.processing ?? 0) > 0
                ? t("usage.processingCount", { count: formatCount(Number(videos?.processing)) })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Stat>
        </div>
      )}
    </div>
  );
}
