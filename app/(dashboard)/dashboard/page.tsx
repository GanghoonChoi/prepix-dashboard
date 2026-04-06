"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ProgressBar,
  ProgressBarTrack,
  ProgressBarFill,
} from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { subscriptionService } from "@/lib/api/services/subscription.service";

const PLAN_NAMES: Record<string, string> = {
  free: "Free", standard: "Standard", pro: "Pro", ultra: "Ultra",
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [subscription, setSubscription] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem("userInfo");
    if (cached) { try { setProfile(JSON.parse(cached)); } catch { /* */ } }

    Promise.allSettled([
      usageService.getUsage(),
      subscriptionService.getCurrent(),
    ]).then(([u, s]) => {
      if (u.status === "fulfilled") setUsage(u.value);
      if (s.status === "fulfilled") setSubscription(s.value);
      setLoading(false);
    });
  }, []);

  const plan = subscription?.plan || "free";
  const quota = (usage as Record<string, Record<string, number | string>>)?.inferenceQuota;
  const videos = (usage as Record<string, Record<string, number>>)?.videos;
  const storage = (usage as Record<string, Record<string, string | number>>)?.storage;

  const remaining = Number(quota?.remaining ?? 0);
  const total = Number(quota?.total ?? 0);
  const used = total - remaining;
  const pct = total > 0 ? (remaining / total) * 100 : 100;

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {profile?.username ? `Welcome back, ${profile.username}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s what&apos;s happening with your account.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border xl:grid-cols-4">
        {([
          { label: "Plan", value: loading ? null : PLAN_NAMES[plan], sub: loading ? null : subscription?.status === "active" ? "Active" : "Inactive" },
          { label: "Credits remaining", value: loading ? null : String(quota?.remainingFormatted ?? `${remaining}s`), sub: loading ? null : `of ${String(quota?.totalFormatted ?? `${total}s`)}` },
          { label: "Videos this month", value: loading ? null : String(videos?.thisMonth ?? 0), sub: loading ? null : `${videos?.completed ?? 0} completed` },
          { label: "Storage used", value: loading ? null : String(storage?.used ?? "0 GB"), sub: loading ? null : `of ${String(storage?.limit ?? "—")}` },
        ]).map((item) => (
          <div key={item.label} className="bg-surface p-5">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted">{item.label}</p>
            {item.value === null ? (
              <Skeleton className="mt-2 h-7 w-20 rounded" />
            ) : (
              <>
                <p className="mt-1.5 text-xl font-semibold tabular-nums text-foreground">{item.value}</p>
                <p className="mt-0.5 text-xs text-muted">{item.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div className="grid gap-8 lg:grid-cols-5">
        {/* Quota */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium text-foreground">Inference quota</h2>
            <Link href="/dashboard/usage" className="text-xs text-muted hover:text-foreground transition-colors">
              View details &rarr;
            </Link>
          </div>

          {loading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <div className="rounded-lg border border-border">
              <div className="p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-sm text-muted">
                    {String(quota?.usedFormatted ?? `${used}s`)} used
                  </span>
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {pct.toFixed(0)}% left
                  </span>
                </div>
                <ProgressBar aria-label="Quota" value={pct} size="sm">
                  <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
                </ProgressBar>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                {[
                  { label: "Total", value: String(quota?.totalFormatted ?? "—") },
                  { label: "Used", value: String(quota?.usedFormatted ?? "—") },
                  { label: "Remaining", value: String(quota?.remainingFormatted ?? "—") },
                ].map((item) => (
                  <div key={item.label} className="px-5 py-3">
                    <p className="text-[11px] text-muted">{item.label}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick links */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-foreground">Quick links</h2>
          <div className="divide-y divide-border rounded-lg border border-border">
            {[
              { label: "Upgrade plan", desc: "Change your subscription", href: "/dashboard/plan" },
              { label: "Account settings", desc: "Manage your profile", href: "/dashboard/settings" },
              { label: "Download app", desc: "Get Prepix for desktop", href: "https://prepix.ai/download", external: true },
            ].map((item) => {
              const inner = (
                <div className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted">{item.desc}</p>
                  </div>
                  <span className="text-muted text-xs">&rarr;</span>
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
      </div>
    </div>
  );
}
