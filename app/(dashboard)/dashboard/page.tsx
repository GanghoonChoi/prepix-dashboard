"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Skeleton, Button } from "@heroui/react";
import {
  ArrowRight,
  ArrowUpRight,
  Download,
  FileVideo,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";
import { usageService } from "@/lib/api/services/usage.service";
import { userService } from "@/lib/api/services/user.service";
import {
  subscriptionService,
  type CurrentSubscription,
} from "@/lib/api/services/subscription.service";
import { cloudService, type Asset } from "@/lib/api/services/cloud.service";
import { PLAN_NAMES, PLAN_STATUS_META } from "@/lib/constants/data";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";
import { downloadUrl } from "@/lib/i18n/config";
import { useCurrentSpace } from "@/components/dashboard/current-space";
import { isPersonal } from "@/lib/workspaces/kind";
import { PageHeader, Stat, Meter, cardClass } from "@/components/ui";

type Usage = {
  inferenceQuota?: {
    total: number;
    remaining: number;
    totalFormatted: string;
    remainingFormatted: string;
  };
  videos?: { thisMonth: number; completed: number; processing: number };
  currentPlan?: string;
  periodEnd?: number;
  bonus?: { remainingSeconds: number; nextExpiresAt: number | null };
};

export default function DashboardPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("dashboard.title"));
  // Someone already in a team (joined by invitation, or made one) has
  // nothing to set up here.
  const { teams, current, links, rows } = useCurrentSpace();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);
  // The cached userInfo predates the answer; ask the server once.
  const [unanswered, setUnanswered] = useState(false);
  useEffect(() => {
    void userService
      .getProfile()
      .then((value) => setUnanswered(!value.useType))
      .catch(() => undefined);
  }, []);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [recent, setRecent] = useState<{ space: string; assets: Asset[] } | null>(null);

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

  // The archive entry is in the nav only when this space's cloud is on, so
  // its presence is the capability answer — no second probe.
  const archive = links.find((link) => link.icon === "archive");
  const spaceId = archive ? current?.id : undefined;
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    cloudService
      .archive(spaceId)
      .then((detail) => {
        if (!alive) return;
        const assets = detail.assets
          .filter((a) => a.state === "ready" && !a.trashedAt)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 4);
        setRecent({ space: spaceId, assets });
      })
      .catch(() => {
        /* the section is a shortcut; the archive page explains failures */
      });
    return () => {
      alive = false;
    };
  }, [spaceId]);

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const day = (value: number | string) =>
    new Date(value).toLocaleDateString(locale, { month: "long", day: "numeric" });

  // /usage reports the same entitled tier, so a failed subscription fetch falls
  // back to it rather than silently claiming the user is on Free.
  const plan = subscription?.plan || usage?.currentPlan || "free";
  const planStatusMeta = subscription ? PLAN_STATUS_META[subscription.status] : undefined;
  const planStatus = planStatusMeta ? t(planStatusMeta.labelKey) : "";
  const quota = usage?.inferenceQuota;
  const videos = usage?.videos;
  const unlimited = (quota?.total ?? 0) < 0;
  const total = Number(quota?.total ?? 0);
  const remaining = Number(quota?.remaining ?? 0);
  const pct = unlimited ? 100 : total > 0 ? (remaining / total) * 100 : 0;
  const bonusMinutes = Math.floor((usage?.bonus?.remainingSeconds ?? 0) / 60);
  const periodEnd = subscription?.currentPeriodEnd;
  const planNote = periodEnd
    ? t(subscription?.cancelledAt ? "dashboard.endsOn" : "dashboard.renews", {
        date: day(periodEnd),
      })
    : planStatus;

  const actions: {
    label: string;
    hint: string;
    href: string;
    Icon: LucideIcon;
    external?: boolean;
  }[] = [
    {
      label: t("dashboard.downloadDesktopApp"),
      hint: t("dashboard.downloadHint"),
      href: downloadUrl(lang),
      Icon: Download,
      external: true,
    },
    {
      label: t("dashboard.redeemCoupon"),
      hint: t("dashboard.redeemHint"),
      href: "/dashboard/plan?redeem=1",
      Icon: TicketPercent,
    },
    ...(teams
      ? [
          {
            label: t("dashboard.createTeam"),
            hint: t("dashboard.createTeamHint"),
            href: "/dashboard/workspaces",
            Icon: Users,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={
          profile?.username
            ? t("dashboard.welcomeBack", { name: profile.username })
            : t("dashboard.welcomeBackGeneric")
        }
        description={t("dashboard.subtitle")}
      />

      {/* Only for accounts that never answered /start's first question. */}
      {process.env.NEXT_PUBLIC_START_ONBOARDING === "1" &&
        unanswered &&
        !rows?.some((row) => !isPersonal(row)) && (
        <Link href={`/start?locale=${lang}`} className={`${cardClass} block p-4 text-sm`}>
          <span className="font-medium">{lang === "ko" ? "시작 설정 마치기" : "Finish setting up"}</span>
          <span className="ml-2 text-muted">{lang === "ko" ? "1분이면 끝나요" : "Takes a minute"}</span>
        </Link>
      )}

      {loadError && (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 px-5 py-4">
          <p className="text-sm text-danger">{t("dashboard.loadError")}</p>
          <Button variant="outline" size="sm" onPress={loadData}>{t("common.retry")}</Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className={`h-[124px] rounded-lg ${i === 0 ? "col-span-2 md:col-span-1" : ""}`} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.4fr_1fr_1fr]">
          <Stat
            className="col-span-2 md:col-span-1"
            label={t("dashboard.creditsRemaining")}
            value={unlimited ? t("dashboard.unlimited") : (quota?.remainingFormatted ?? "—")}
            unit={
              unlimited || !quota
                ? undefined
                : t("dashboard.ofTotal", { total: quota.totalFormatted })
            }
          >
            <Meter value={pct} />
            <p className="mt-2">
              {[
                usage?.periodEnd ? t("dashboard.resets", { date: day(usage.periodEnd) }) : null,
                bonusMinutes > 0 ? t("dashboard.bonusIncluded", { minutes: String(bonusMinutes) }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Stat>
          <Stat
            label={t("dashboard.planLabel")}
            value={PLAN_NAMES[plan] ?? PLAN_NAMES.free}
          >
            <Link href="/dashboard/plan" className="inline-flex items-center gap-1 hover:text-foreground">
              {planNote || t("dashboard.upgradePlan")}
              <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </Stat>
          <Stat
            label={t("dashboard.videosThisMonth")}
            value={String(videos?.thisMonth ?? 0)}
          >
            {[
              t("dashboard.completedCount", { count: videos?.completed ?? 0 }),
              videos?.processing ? t("dashboard.processingCount", { count: videos.processing }) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Stat>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-[13px] font-medium">{t("dashboard.quickActions")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actions.map(({ label, hint, href, Icon, external }) => {
            const inner = (
              <>
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface">
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{label}</span>
                  <span className="block truncate text-xs text-muted">{hint}</span>
                </span>
                {external ? (
                  <ArrowUpRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
                ) : (
                  <ArrowRight size={14} className="shrink-0 text-muted" aria-hidden="true" />
                )}
              </>
            );
            const className = `${cardClass} flex items-center gap-3 p-4 transition-colors hover:bg-surface`;
            return external ? (
              <a key={href} href={href} target="_blank" rel="noopener noreferrer" className={className}>
                {inner}
              </a>
            ) : (
              <Link key={href} href={href} className={className}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {archive && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium">{t("dashboard.recentUploads")}</h2>
            <Link
              href={archive.href}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
            >
              {t("dashboard.openArchive")} <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <div className={`${cardClass} divide-y divide-border`}>
            {!recent || recent.space !== spaceId ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-4 w-1/2 rounded" />
              </div>
            ) : recent.assets.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-muted">{t("dashboard.noUploads")}</p>
            ) : (
              recent.assets.map((asset) => (
                <Link
                  key={asset.id}
                  href={archive.href}
                  className="flex items-center gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-surface"
                >
                  <FileVideo size={16} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{ago(asset.createdAt, locale)}</span>
                </Link>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** "2시간 전", "어제", then a date once it is more than a week old. */
function ago(iso: string, locale: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), "hour");
  if (minutes < 60 * 24 * 7) return rtf.format(-Math.round(minutes / 1440), "day");
  return new Date(iso).toLocaleDateString(locale, { month: "long", day: "numeric" });
}
