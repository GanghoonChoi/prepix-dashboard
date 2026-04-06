"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  Chip,
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
} from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";

export default function UsagePage() {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<Record<string, Record<string, number | string>> | null>(null);

  useEffect(() => {
    usageService
      .getUsage()
      .then(setUsage)
      .catch(() => {
        setUsage({
          inferenceQuota: {
            total: 6000, used: 0, remaining: 6000,
            totalFormatted: "01:40:00", usedFormatted: "00:00:00",
            remainingFormatted: "01:40:00", usagePercentage: 0,
          },
          videos: { total: 0, thisMonth: 0, completed: 0, processing: 0 },
          storage: { used: "0 GB", usedBytes: 0, limit: "1 GB", limitBytes: 1073741824, usagePercentage: 0 },
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const quota = usage?.inferenceQuota;
  const videos = usage?.videos;
  const storage = usage?.storage;

  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const pct = total > 0 ? (remaining / total) * 100 : 100;
  const storagePct = Number(storage?.usagePercentage ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Usage</h1>
        <p className="mt-1 text-sm text-muted">Monitor your resource consumption.</p>
      </div>

      {/* Inference Quota */}
      <Card>
        <CardHeader>
          <div className="flex w-full items-center justify-between">
            <div>
              <CardTitle className="text-base">Inference Quota</CardTitle>
              <CardDescription>Monthly AI processing time</CardDescription>
            </div>
            {!loading && (
              <Chip
                size="sm"
                color={pct > 50 ? "success" : pct > 20 ? "warning" : "danger"}
                variant="soft"
              >
                {pct > 50 ? "Healthy" : pct > 20 ? "Low" : "Critical"}
              </Chip>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <Skeleton className="h-28 w-full rounded" />
          ) : (
            <>
              {/* Big number + bar */}
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tabular-nums text-foreground">
                    {pct.toFixed(0)}%
                  </span>
                  <span className="text-sm text-muted">remaining</span>
                </div>
                <ProgressBar aria-label="Quota" value={pct} size="lg">
                  <ProgressBarTrack>
                    <ProgressBarFill />
                  </ProgressBarTrack>
                </ProgressBar>
              </div>

              {/* Details */}
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: "Total", value: String(quota?.totalFormatted ?? "—") },
                  { label: "Used", value: String(quota?.usedFormatted ?? "—") },
                  { label: "Remaining", value: String(quota?.remainingFormatted ?? "—") },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs font-medium text-muted">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Videos + Storage row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Videos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Videos</CardTitle>
            <CardDescription>Processing activity</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full rounded" />
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                {[
                  { label: "Total", value: videos?.total ?? 0 },
                  { label: "This month", value: videos?.thisMonth ?? 0 },
                  { label: "Completed", value: videos?.completed ?? 0 },
                  { label: "Processing", value: videos?.processing ?? 0 },
                ].map((item) => (
                  <div key={item.label}>
                    <p className="text-xs font-medium text-muted">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                      {String(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage</CardTitle>
            <CardDescription>Disk usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-20 w-full rounded" />
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-semibold tabular-nums text-foreground">
                    {String(storage?.used ?? "0 GB")}
                  </span>
                  <span className="text-sm text-muted">
                    of {String(storage?.limit ?? "—")}
                  </span>
                </div>
                <ProgressBar aria-label="Storage" value={storagePct} size="sm">
                  <ProgressBarTrack>
                    <ProgressBarFill />
                  </ProgressBarTrack>
                </ProgressBar>
                <p className="text-xs text-muted">
                  {storagePct.toFixed(1)}% used
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
