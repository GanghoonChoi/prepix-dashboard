"use client";

import { useState, useEffect } from "react";
import { Button, Chip } from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { Check } from "lucide-react";
import {
  subscriptionService,
  type CatalogPlan,
  type BillingInterval,
  type CurrentSubscription,
} from "@/lib/api/services/subscription.service";
import { PLAN_NAMES, PLAN_COPY, formatPrice } from "@/lib/constants/data";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";

const STATUS_META: Record<
  string,
  { labelKey: string; color: "success" | "danger" | "warning" | "default" }
> = {
  active: { labelKey: "plan.statusActive", color: "success" },
  trialing: { labelKey: "plan.statusTrial", color: "success" },
  past_due: { labelKey: "plan.statusPastDue", color: "warning" },
  pending_cancel: { labelKey: "plan.statusCancelling", color: "warning" },
  paused: { labelKey: "plan.statusPaused", color: "default" },
  canceled: { labelKey: "plan.statusCancelled", color: "danger" },
  refunded: { labelKey: "plan.statusRefunded", color: "danger" },
  chargeback: { labelKey: "plan.statusChargeback", color: "danger" },
};

export default function PlanPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("plan.title"));
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [interval, setBillingInterval] = useState<BillingInterval>("month");
  const [justUpgraded, setJustUpgraded] = useState(false);
  const cancelModal = useOverlayState();
  const refundModal = useOverlayState();

  const loadData = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      subscriptionService.getCurrent(),
      subscriptionService.getPlans(),
    ])
      .then(([sub, catalog]) => {
        setCurrentSub(sub);
        setPlans(catalog);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();

    // Returned here from the hosted-checkout redirect (?success=true). The
    // Paddle webhook updates the plan server-side asynchronously, so show a
    // confirmation and strip the query param from the URL.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("success") === "true") {
        setJustUpgraded(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  const handleUpgrade = async (planId: string) => {
    setActionLoading(true);
    try {
      const result = await subscriptionService.checkout(planId, interval);
      // Open the in-page Paddle overlay against the SERVER-CREATED transaction
      // (client-side transaction creation via `items` is blocked for this
      // vendor). Customer, plan and any launch discount are already baked into
      // the transaction server-side. On completion the layout's eventCallback
      // reloads the page. If Paddle.js isn't ready, fall back to the hosted
      // checkout page (which opens the same transaction by id).
      if (result.transactionId && window.Paddle && window.__paddleReady) {
        window.Paddle.Checkout.open({
          transactionId: result.transactionId,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            showAddDiscounts: false,
            successUrl: `${window.location.origin}/dashboard/plan?success=true`,
          },
        });
      } else if (result.checkoutUrl) {
        // Full-page navigation to a hosted checkout — not React state.
        // eslint-disable-next-line react-hooks/immutability
        window.location.href = result.checkoutUrl;
      } else {
        toast(t("plan.checkoutUnavailable"), "error");
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || t("plan.checkoutFailed"), "error");
    }
    setActionLoading(false);
  };

  // Refresh the current subscription after a mutation. Best-effort: the mutation
  // already succeeded server-side, so a reload failure must NOT be reported as
  // the mutation failing (the next page load reconciles).
  const refreshCurrent = async () => {
    try {
      setCurrentSub(await subscriptionService.getCurrent());
    } catch {
      /* keep the stale view */
    }
  };

  const confirmCancel = async () => {
    setActionLoading(true);
    try {
      await subscriptionService.cancel();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || t("plan.cancelFailed"), "error");
      setActionLoading(false);
      return;
    }
    cancelModal.close();
    toast(t("plan.cancelToast"));
    await refreshCurrent();
    setActionLoading(false);
  };

  const confirmRefund = async () => {
    setActionLoading(true);
    let message = t("plan.refundToast");
    try {
      const res = await subscriptionService.refund();
      if (res?.message) message = res.message;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || t("plan.refundFailed"), "error");
      setActionLoading(false);
      return;
    }
    refundModal.close();
    toast(message);
    await refreshCurrent();
    setActionLoading(false);
  };

  const currentPlan = currentSub?.plan || "free";
  const status = currentSub?.status ?? "active";
  const statusMeta = STATUS_META[status];
  const statusLabel = statusMeta ? t(statusMeta.labelKey) : status;
  const statusColor = statusMeta?.color ?? "default";
  const periodEndLabel = currentSub?.currentPeriodEnd
    ? new Date(currentSub.currentPeriodEnd).toLocaleDateString(
        lang === "ko" ? "ko-KR" : "en-US",
      )
    : null;
  // Only a pending cancel keeps access until the period end. canceled/refunded/
  // chargeback mean access has already ended.
  const showPeriodEnd = status === "pending_cancel" && !!periodEndLabel;
  const isEnded = ["canceled", "refunded", "chargeback"].includes(status);
  const canCancel =
    currentPlan !== "free" && ["active", "trialing", "past_due"].includes(status);
  // Gated on the backend's eligibility flag (paid, non-terminal, within the
  // 14-day window) so we never show a refund action that would only 4xx.
  const canRefund = currentSub?.refundEligible === true;
  const hasAnnual = plans.some((p) => p.prices.some((pr) => pr.interval === "year"));

  const priceLabel = (plan: CatalogPlan) => {
    if (plan.status === "coming_soon")
      return { big: t("plan.comingSoon"), strike: null as string | null, sub: null as string | null };
    const price = plan.prices.find((p) => p.interval === interval) ?? plan.prices[0];
    if (!price) return { big: formatPrice("KRW", 0), strike: null, sub: t("plan.freeForever") };

    const pct = price.launchDiscountPercent ?? 0;
    const net = pct ? Math.round(price.unitAmount * (1 - pct / 100)) : price.unitAmount;
    const per = price.interval === "year" ? t("plan.perYear") : t("plan.perMonth");
    const strike = pct ? formatPrice(price.currency, price.unitAmount) : null;

    let sub: string;
    if (price.interval === "year") {
      const perMonth = formatPrice(price.currency, Math.round(net / 12));
      const prefix = pct ? t("plan.launchPrefix", { pct }) : "";
      sub = prefix + t("plan.annualSuffix", { perMonth });
    } else {
      sub = pct ? t("plan.launchMonthly", { pct }) : t("plan.billedMonthly");
    }
    return { big: `${formatPrice(price.currency, net)}${per}`, strike, sub };
  };

  const buttonFor = (plan: CatalogPlan) => {
    const isCurrent = currentPlan === plan.id;
    if (isCurrent) return { label: t("plan.currentPlan"), disabled: true, onPress: () => {} };
    if (plan.status === "coming_soon") return { label: t("plan.comingSoon"), disabled: true, onPress: () => {} };
    if (plan.prices.length === 0) {
      // Free tier — only a downgrade target when you're on a paid plan.
      return { label: t("plan.downgrade"), disabled: currentPlan === "free", onPress: () => cancelModal.open() };
    }
    return { label: t("plan.get", { name: plan.displayName }), disabled: false, onPress: () => handleUpgrade(plan.id) };
  };

  const toggleClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("plan.title")}</h1>

      {justUpgraded && (
        <div className="rounded-md border border-border bg-foreground/[0.03] px-4 py-3 text-sm text-foreground">
          {t("plan.paymentReceived")}
        </div>
      )}

      {/* Current plan */}
      {loading ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : loadError ? (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 p-6">
          <p className="text-sm text-danger">{t("plan.loadError")}</p>
          <Button variant="outline" size="sm" onPress={loadData}>{t("common.retry")}</Button>
        </div>
      ) : (
        <div className="flex items-start justify-between rounded-lg border border-border p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-foreground">{PLAN_NAMES[currentPlan] || "Free"}</h2>
              {currentPlan !== "free" && (
                <Chip size="sm" color={statusColor} variant="soft">
                  {statusLabel}
                </Chip>
              )}
            </div>
            {showPeriodEnd ? (
              <p className="mt-1 text-sm text-muted">
                {t("plan.accessUntil", { date: periodEndLabel! })}
              </p>
            ) : isEnded ? (
              <p className="mt-1 text-sm text-muted">
                {t("plan.ended")}
              </p>
            ) : status === "past_due" ? (
              <p className="mt-1 text-sm text-warning">
                {t("plan.pastDue")}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {currentPlan === "free" ? t("plan.onFree") : t("plan.active")}
              </p>
            )}
          </div>
          {(canCancel || canRefund) && (
            <div className="flex flex-col items-end gap-1.5">
              {canCancel && (
                <button
                  onClick={() => cancelModal.open()}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  {t("plan.cancelSubscription")}
                </button>
              )}
              {canRefund && (
                <button
                  onClick={() => refundModal.open()}
                  className="text-xs text-muted hover:text-foreground transition-colors"
                >
                  {t("plan.requestRefund")}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plan cards */}
      {!loading && !loadError && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">{t("plan.availablePlans")}</h2>
            {hasAnnual && (
              <div className="inline-flex rounded-md border border-border p-0.5">
                <button className={toggleClass(interval === "month")} onClick={() => setBillingInterval("month")}>
                  {t("plan.monthly")}
                </button>
                <button className={toggleClass(interval === "year")} onClick={() => setBillingInterval("year")}>
                  {t("plan.annual")}
                </button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const emphasize = plan.id === "creator" && !isCurrent;
              const price = priceLabel(plan);
              const btn = buttonFor(plan);
              const copy = PLAN_COPY[lang][plan.id];

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-lg border p-6 transition-colors ${
                    isCurrent
                      ? "border-foreground/30 bg-foreground/[0.02]"
                      : emphasize
                        ? "border-foreground/25 hover:border-foreground/40"
                        : "border-border hover:border-foreground/15"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-base font-semibold text-foreground">{plan.displayName}</p>
                      {emphasize && (
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">{t("plan.popular")}</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">{t("plan.current")}</span>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-baseline gap-2">
                        {price.strike && (
                          <span className="text-sm text-muted line-through">{price.strike}</span>
                        )}
                        <span className="text-3xl font-semibold text-foreground">{price.big}</span>
                      </div>
                      {price.sub && <p className="mt-1 text-xs text-muted">{price.sub}</p>}
                    </div>

                    {copy && <p className="mt-3 text-xs leading-relaxed text-muted">{copy.description}</p>}

                    {copy && (
                      <ul className="mt-5 space-y-2">
                        {copy.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2 text-sm text-muted">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground/50" />
                            {feat}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Button
                    className="mt-6 w-full"
                    variant={isCurrent || plan.status === "coming_soon" ? "outline" : "primary"}
                    size="sm"
                    isDisabled={btn.disabled || actionLoading}
                    onPress={btn.onPress}
                  >
                    {btn.label}
                  </Button>

                  {emphasize && (
                    <p className="mt-2 text-center text-[11px] text-muted">
                      {t("plan.cancelAnytime")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cancel modal */}
      <Dialog state={cancelModal} title={t("plan.cancelModalTitle")}>
        <p className="text-sm text-muted">
          {t("plan.cancelModalBody")}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => cancelModal.close()} isDisabled={actionLoading}>{t("plan.keepPlan")}</Button>
          <Button variant="danger" size="sm" onPress={confirmCancel} isDisabled={actionLoading}>
            {actionLoading ? t("plan.cancelling") : t("plan.cancelSubscription")}
          </Button>
        </div>
      </Dialog>

      {/* Refund modal */}
      <Dialog state={refundModal} title={t("plan.refundModalTitle")}>
        <p className="text-sm text-muted">
          {t("plan.refundModalBody")}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => refundModal.close()} isDisabled={actionLoading}>{t("plan.keepPlan")}</Button>
          <Button variant="danger" size="sm" onPress={confirmRefund} isDisabled={actionLoading}>
            {actionLoading ? t("plan.processing") : t("plan.refundAndCancel")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
