"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Skeleton } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";
import { BillingHeader } from "@/components/dashboard/billing-header";
import { Button, Card, Meter, MeterRow, Notice } from "@/components/ui";
import { formatDay, formatDuration } from "@/lib/format";

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

  // Locale-aware thousands separators for the video counts; durations go
  // through lib/format from the seconds (the server's "38m" is English).
  const formatCount = (n: number) =>
    n.toLocaleString(lang === "ko" ? "ko-KR" : "en-US");
  // formatDuration says "1분 미만" for anything under a minute, which is a lie
  // about a used-up quota; nothing left is 0.
  // ponytail: belongs in lib/format.formatDuration once that file is open again.
  const duration = (seconds: number) =>
    seconds > 0 ? formatDuration(seconds, lang) : lang === "ko" ? "0분" : "0m";
  const videoCount = formatCount(Number(videos?.thisMonth ?? 0));
  const videoFoot = [
    t("usage.completedCount", { count: formatCount(Number(videos?.completed ?? 0)) }),
    Number(videos?.processing ?? 0) > 0
      ? t("usage.processingCount", { count: formatCount(Number(videos?.processing)) })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <BillingHeader />

      {loadError && !loading ? (
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
      ) : loading ? (
        <Skeleton className="h-[180px] rounded-lg" />
      ) : (
        <Card>
          <div className="space-y-6">
            {/* Time LEFT: a full bar is good news, so it never turns amber the
                way a used-of-limit meter does near 100%. */}
            <UsageRow
              label={t("usage.timeLeft")}
              value={
                unlimited
                  ? t("usage.unlimited")
                  : quota
                    ? `${duration(remaining)} ${t("usage.ofTotal", { total: duration(total) })}`
                    : "—"
              }
              meter={<Meter value={pct} tone="neutral" />}
              foot={[
                quota && !unlimited
                  ? t("usage.usedAmount", { amount: duration(Number(quota.used ?? 0)) })
                  : null,
                bonus && bonus.remainingSeconds > 0
                  ? t("coupon.usageBonus", {
                      minutes: String(Math.floor(bonus.remainingSeconds / 60)),
                      date: bonus.nextExpiresAt ? formatDay(new Date(bonus.nextExpiresAt), lang) : "—",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            {/* No allowance (-1 = no limit) has nothing to fill. */}
            {allowance > 0 ? (
              <MeterRow
                label={t("usage.videosThisMonth")}
                value={`${videoCount} ${t("usage.ofTotal", { total: formatCount(allowance) })}`}
                percent={(Number(videos?.thisMonth ?? 0) / allowance) * 100}
                foot={videoFoot}
              />
            ) : (
              <UsageRow label={t("usage.videosThisMonth")} value={videoCount} foot={videoFoot} />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

/** `MeterRow`'s layout with the bar optional and its tone the caller's. */
function UsageRow({
  label,
  value,
  meter,
  foot,
}: {
  label: string;
  value: ReactNode;
  meter?: ReactNode;
  foot?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      {meter}
      {foot && <p className="text-xs text-muted">{foot}</p>}
    </div>
  );
}
