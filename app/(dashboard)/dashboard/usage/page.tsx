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

export default function UsagePage() {
  usePageTitle("Usage");
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

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usage</h1>

      {loadError && !loading && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 p-6">
          <p className="text-sm text-danger">Couldn&apos;t load your usage data.</p>
          <Button variant="outline" size="sm" onPress={loadUsage}>Retry</Button>
        </div>
      )}

      {/* Inference */}
      <section className={`space-y-4 ${loadError && !loading ? "hidden" : ""}`}>
        <h2 className="text-sm font-medium text-foreground">Inference quota</h2>
        {loading ? (
          <Skeleton className="h-36 w-full rounded-lg" />
        ) : (
          <div className="rounded-lg border border-border">
            <div className="p-6">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-semibold tabular-nums text-foreground">{pct.toFixed(0)}%</span>
                <span className="text-sm text-muted">remaining</span>
              </div>
              <div className="mt-4">
                <ProgressBar aria-label="Quota" value={pct} size="sm">
                  <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
                </ProgressBar>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
              {[
                { label: "Total", value: String(quota?.totalFormatted ?? "—") },
                { label: "Used", value: String(quota?.usedFormatted ?? "—") },
                { label: "Remaining", value: String(quota?.remainingFormatted ?? "—") },
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
        <h2 className="text-sm font-medium text-foreground">Videos</h2>
        {loading ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border lg:grid-cols-4">
            {[
              { label: "Total", value: videos?.total ?? 0 },
              { label: "This month", value: videos?.thisMonth ?? 0 },
              { label: "Completed", value: videos?.completed ?? 0 },
              { label: "Processing", value: videos?.processing ?? 0 },
            ].map((item) => (
              <div key={item.label} className="bg-surface px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{String(item.value)}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
