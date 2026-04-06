"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  Button,
} from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { usageService } from "@/lib/api/services/usage.service";
import { subscriptionService } from "@/lib/api/services/subscription.service";

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  ultra: "Ultra",
};

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  const [usage, setUsage] = useState<Record<string, unknown> | null>(null);
  const [subscription, setSubscription] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const cached = localStorage.getItem("userInfo");
    if (cached) {
      try { setProfile(JSON.parse(cached)); } catch { /* ignore */ }
    }

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
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{profile?.username ? `, ${profile.username}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s an overview of your account.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted">Current Plan</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-20 rounded" />
            ) : (
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-semibold text-foreground">
                  {PLAN_NAMES[plan]}
                </span>
                <Chip size="sm" color="success" variant="soft">Active</Chip>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted">Credits Remaining</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-24 rounded" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {String(quota?.remainingFormatted ?? `${remaining}s`)}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  of {String(quota?.totalFormatted ?? `${total}s`)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted">Videos This Month</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-12 rounded" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {videos?.thisMonth ?? 0}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {videos?.completed ?? 0} completed
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-xs font-medium text-muted">Storage</p>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16 rounded" />
            ) : (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                  {String(storage?.used ?? "0 GB")}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  of {String(storage?.limit ?? "—")}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quota + Quick links row */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Quota section */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex w-full items-center justify-between">
              <CardTitle className="text-base">Inference Quota</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => router.push("/dashboard/usage")}
              >
                View details
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <Skeleton className="h-24 w-full rounded" />
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">
                      {String(quota?.usedFormatted ?? `${used}s`)} used
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {pct.toFixed(0)}% remaining
                    </span>
                  </div>
                  <ProgressBar aria-label="Quota" value={pct} size="lg">
                    <ProgressBarTrack>
                      <ProgressBarFill />
                    </ProgressBarTrack>
                  </ProgressBar>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  {[
                    { label: "Total", value: String(quota?.totalFormatted ?? "—") },
                    { label: "Used", value: String(quota?.usedFormatted ?? "—") },
                    { label: "Remaining", value: String(quota?.remainingFormatted ?? "—") },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-muted">{item.label}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Quick Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { label: "Upgrade plan", desc: "Change your subscription", href: "/dashboard/plan" },
              { label: "Account settings", desc: "Manage your profile", href: "/dashboard/settings" },
              { label: "Download app", desc: "Get Prepix for desktop", href: "https://prepix.ai/download", external: true },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => item.external ? window.open(item.href, "_blank") : router.push(item.href)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors hover:bg-surface"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted">{item.desc}</p>
                </div>
                <span className="text-xs text-muted">&rarr;</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
