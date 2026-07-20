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
import { useI18n } from "@/lib/i18n/context";
import { downloadUrl } from "@/lib/i18n/config";

export default function DashboardPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("dashboard.title"));
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
        {profile?.username
          ? t("dashboard.welcomeBack", { name: profile.username })
          : t("dashboard.welcomeBackGeneric")}
      </h1>

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 px-5 py-4">
          <p className="text-sm text-danger">{t("dashboard.loadError")}</p>
          <Button variant="outline" size="sm" onPress={loadData}>{t("common.retry")}</Button>
        </div>
      )}

      {/* Hero: credits remaining */}
      {loading ? (
        <Skeleton className="h-44 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted">
              {t("dashboard.creditsRemaining")}
            </p>
            <Link
              href="/dashboard/usage"
              className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
            >
              {t("dashboard.usage")} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <p className="mt-3 text-5xl font-semibold tabular-nums tracking-tight text-foreground">
            {String(quota?.remainingFormatted ?? `${remaining}s`)}
          </p>
          <div className="mt-5">
            <ProgressBar aria-label={t("dashboard.creditsRemaining")} value={pct} size="sm">
              <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
            </ProgressBar>
          </div>
          <p className="mt-3 text-sm text-muted">
            {t("dashboard.usedOfTotal", {
              used: String(quota?.usedFormatted ?? `${used}s`),
              total: String(quota?.totalFormatted ?? `${total}s`),
            })}
          </p>
        </div>
      )}

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border">
        {([
          { label: t("dashboard.planLabel"), value: loading ? null : PLAN_NAMES[plan], sub: loading ? null : subscription?.status === "active" ? t("dashboard.active") : t("dashboard.inactive") },
          { label: t("dashboard.videosThisMonth"), value: loading ? null : String(videos?.thisMonth ?? 0), sub: loading ? null : t("dashboard.completedCount", { count: videos?.completed ?? 0 }) },
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
          { label: t("dashboard.upgradePlan"), href: "/dashboard/plan" },
          { label: t("dashboard.settings"), href: "/dashboard/settings" },
          { label: t("dashboard.downloadDesktopApp"), href: downloadUrl(lang), external: true },
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
