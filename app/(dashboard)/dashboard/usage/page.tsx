"use client";

import { useState, useEffect } from "react";
import {
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
} from "@heroui/react";
import { Skeleton, Button } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";

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
  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const pct = total > 0 ? (remaining / total) * 100 : 100;

  // Locale-aware thousands separators for raw counts (the quota totals below
  // are pre-formatted strings from the backend, so only the video counts need
  // this).
  const formatCount = (n: number) =>
    n.toLocaleString(lang === "ko" ? "ko-KR" : "en-US");

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("usage.title")}</h1>

      {loadError && !loading && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 p-6">
          <p className="text-sm text-danger">{t("usage.loadError")}</p>
          <Button variant="outline" size="sm" onPress={loadUsage}>{t("common.retry")}</Button>
        </div>
      )}

      {/* Inference */}
      <section className={`space-y-4 ${loadError && !loading ? "hidden" : ""}`}>
        <h2 className="text-sm font-medium text-foreground">{t("usage.inferenceQuota")}</h2>
        {loading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : (
          <div className="rounded-lg border border-border">
            <div className="p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums text-foreground">{pct.toFixed(0)}%</span>
                <span className="text-sm text-muted">{t("usage.remaining")}</span>
              </div>
              <div className="mt-4">
                <ProgressBar aria-label={t("usage.inferenceQuota")} value={pct} size="sm">
                  <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
                </ProgressBar>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              {[
                { label: t("usage.total"), value: String(quota?.totalFormatted ?? "—") },
                { label: t("usage.used"), value: String(quota?.usedFormatted ?? "—") },
                { label: t("usage.remaining"), value: String(quota?.remainingFormatted ?? "—") },
              ].map((item) => (
                <div key={item.label} className="px-6 py-4">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-muted">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Videos */}
      <section className={`space-y-4 ${loadError && !loading ? "hidden" : ""}`}>
        <h2 className="text-sm font-medium text-foreground">{t("usage.videos")}</h2>
        {loading ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border lg:grid-cols-4">
            {[
              { label: t("usage.total"), value: Number(videos?.total ?? 0) },
              { label: t("usage.thisMonth"), value: Number(videos?.thisMonth ?? 0) },
              { label: t("usage.completed"), value: Number(videos?.completed ?? 0) },
              { label: t("usage.processing"), value: Number(videos?.processing ?? 0) },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatCount(item.value)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
