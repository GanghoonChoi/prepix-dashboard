"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
} from "@heroui/react";
import { Skeleton, Button } from "@heroui/react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { usageService } from "@/lib/api/services/usage.service";
import {
  subscriptionService,
  type CurrentSubscription,
} from "@/lib/api/services/subscription.service";
import { PLAN_NAMES } from "@/lib/constants/data";
import { usePageTitle } from "@/lib/hooks/use-page-title";

export default function DashboardPage() {
  usePageTitle("Overview");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);

  const loadData = () => {
    setLoading(true);
    setLoadError(false);
    Promise.allSettled([
      usageService.getUsage(),
      subscriptionService.getCurrent(),
    ]).then(([u, s]) => {
      if (u.status === "fulfilled") setUsage(u.value);
      if (s.status === "fulfilled") setSubscription(s.value);
      // Surface a retry only when everything failed — a partial load still
      // renders what we have rather than nagging.
      if (u.status === "rejected" && s.status === "rejected") setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(() => {
    // Hydrate from the localStorage cache on mount (unavailable during SSR),
    // then refresh from the API. Standard mount-only pattern.
    const cached = localStorage.getItem("userInfo");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) { try { setProfile(JSON.parse(cached)); } catch { /* */ } }
    loadData();
  }, []);

  const plan = subscription?.plan || "free";
  const quota = (usage as Record<string, Record<string, number | string>>)?.inferenceQuota;
  const videos = (usage as Record<string, Record<string, number>>)?.videos;
  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const used = total - remaining;
  const pct = total > 0 ? (remaining / total) * 100 : 100;

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {profile?.username ? `Welcome back, ${profile.username}` : "Welcome back"}
      </h1>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 px-5 py-4">
          <p className="text-sm text-danger">Couldn&apos;t load your account data.</p>
          <Button variant="outline" size="sm" onPress={loadData}>Retry</Button>
        </div>
      )}

      {/* Hero: credits remaining */}
      {loading ? (
        <Skeleton className="h-44 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted">
              Credits remaining
            </p>
            <Link
              href="/dashboard/usage"
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              Usage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-foreground">
            {String(quota?.remainingFormatted ?? `${remaining}s`)}
          </p>
          <div className="mt-5">
            <ProgressBar aria-label="Credits remaining" value={pct} size="sm">
              <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
            </ProgressBar>
          </div>
          <p className="mt-3 text-sm text-muted">
            {String(quota?.usedFormatted ?? `${used}s`)} used of{" "}
            {String(quota?.totalFormatted ?? `${total}s`)} this month
          </p>
        </div>
      )}

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border">
        {([
          { label: "Plan", value: loading ? null : PLAN_NAMES[plan], sub: loading ? null : subscription?.status === "active" ? "Active" : "Inactive" },
          { label: "Videos this month", value: loading ? null : String(videos?.thisMonth ?? 0), sub: loading ? null : `${videos?.completed ?? 0} completed` },
        ]).map((item) => (
          <div key={item.label} className="bg-surface p-5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted">{item.label}</p>
            {item.value === null ? (
              <Skeleton className="mt-2 h-6 w-16 rounded" />
            ) : (
              <>
                <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
                <p className="mt-0.5 text-xs text-muted">{item.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {[
          { label: "Upgrade plan", href: "/dashboard/plan" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Download desktop app", href: "https://prepix.ai/download", external: true },
        ].map((item) => {
          const inner = (
            <div className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-foreground/[0.03]">
              <span className="text-sm font-medium text-foreground">{item.label}</span>
              {item.external ? (
                <ArrowUpRight className="h-4 w-4 text-muted" />
              ) : (
                <ArrowRight className="h-4 w-4 text-muted" />
              )}
            </div>
          );
          return item.external ? (
            <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer">{inner}</a>
          ) : (
            <Link key={item.label} href={item.href}>{inner}</Link>
          );
        })}
      </div>
    </div>
  );
}
