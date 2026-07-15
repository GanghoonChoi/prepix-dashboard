"use client";

import { useState, useEffect } from "react";
import { Button, Chip } from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { Check } from "lucide-react";
import {
  subscriptionService,
  type CatalogPlan,
  type BillingInterval,
} from "@/lib/api/services/subscription.service";
import { PLAN_NAMES, PLAN_COPY, formatPrice } from "@/lib/constants/data";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/hooks/use-page-title";

const STATUS_META: Record<
  string,
  { label: string; color: "success" | "danger" | "warning" | "default" }
> = {
  active: { label: "Active", color: "success" },
  trialing: { label: "Trial", color: "success" },
  past_due: { label: "Payment due", color: "warning" },
  pending_cancel: { label: "Cancelling", color: "warning" },
  paused: { label: "Paused", color: "default" },
  canceled: { label: "Cancelled", color: "danger" },
  refunded: { label: "Refunded", color: "danger" },
  chargeback: { label: "Chargeback", color: "danger" },
};

export default function PlanPage() {
  usePageTitle("Plan");
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<Record<string, string> | null>(null);
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
        toast("Checkout is not available right now. Please try again later.", "error");
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || "Failed to start checkout", "error");
    }
    setActionLoading(false);
  };

  const confirmCancel = async () => {
    setActionLoading(true);
    try {
      await subscriptionService.cancel();
      const data = await subscriptionService.getCurrent();
      setCurrentSub(data);
      cancelModal.close();
      toast("Subscription cancelled. Access continues until your billing period ends.");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || "Failed to cancel", "error");
    }
    setActionLoading(false);
  };

  const confirmRefund = async () => {
    setActionLoading(true);
    try {
      const res = await subscriptionService.refund();
      const data = await subscriptionService.getCurrent();
      setCurrentSub(data);
      refundModal.close();
      toast(res?.message || "Your payment has been refunded and your subscription cancelled.");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || "Failed to process refund", "error");
    }
    setActionLoading(false);
  };

  const currentPlan = currentSub?.plan || "free";
  const status = currentSub?.status ?? "active";
  const statusMeta = STATUS_META[status] ?? { label: status, color: "default" as const };
  const showPeriodEnd =
    (status === "canceled" || status === "pending_cancel") && currentSub?.currentPeriodEnd;
  const canCancel =
    currentPlan !== "free" && ["active", "trialing", "past_due"].includes(status);
  const hasAnnual = plans.some((p) => p.prices.some((pr) => pr.interval === "year"));

  const priceLabel = (plan: CatalogPlan) => {
    if (plan.status === "coming_soon")
      return { big: "Coming soon", strike: null as string | null, sub: null as string | null };
    const price = plan.prices.find((p) => p.interval === interval) ?? plan.prices[0];
    if (!price) return { big: formatPrice("KRW", 0), strike: null, sub: "Free forever" };

    const pct = price.launchDiscountPercent ?? 0;
    const net = pct ? Math.round(price.unitAmount * (1 - pct / 100)) : price.unitAmount;
    const per = price.interval === "year" ? "/yr" : "/mo";
    const strike = pct ? formatPrice(price.currency, price.unitAmount) : null;

    let sub: string;
    if (price.interval === "year") {
      const perMonth = Math.round(net / 12);
      sub = `${pct ? `−${pct}% launch · ` : ""}≈ ${formatPrice(price.currency, perMonth)}/mo, billed annually`;
    } else {
      sub = pct ? `−${pct}% launch offer · billed monthly` : "Billed monthly";
    }
    return { big: `${formatPrice(price.currency, net)}${per}`, strike, sub };
  };

  const buttonFor = (plan: CatalogPlan) => {
    const isCurrent = currentPlan === plan.id;
    if (isCurrent) return { label: "Current plan", disabled: true, onPress: () => {} };
    if (plan.status === "coming_soon") return { label: "Coming soon", disabled: true, onPress: () => {} };
    if (plan.prices.length === 0) {
      // Free tier — only a downgrade target when you're on a paid plan.
      return { label: "Downgrade", disabled: currentPlan === "free", onPress: () => cancelModal.open() };
    }
    return { label: `Get ${plan.displayName}`, disabled: false, onPress: () => handleUpgrade(plan.id) };
  };

  const toggleClass = (active: boolean) =>
    `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-foreground text-background" : "text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Plan</h1>

      {justUpgraded && (
        <div className="rounded-md border border-border bg-foreground/[0.03] px-4 py-3 text-sm text-foreground">
          Payment received. Your plan will update within a few moments — refresh
          if it hasn&apos;t changed yet.
        </div>
      )}

      {/* Current plan */}
      {loading ? (
        <Skeleton className="h-20 w-full rounded-lg" />
      ) : loadError ? (
        <div className="flex items-center justify-between rounded-lg border border-danger/30 bg-danger/5 p-6">
          <p className="text-sm text-danger">Couldn&apos;t load your subscription.</p>
          <Button variant="outline" size="sm" onPress={loadData}>Retry</Button>
        </div>
      ) : (
        <div className="flex items-start justify-between rounded-lg border border-border p-6">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-semibold text-foreground">{PLAN_NAMES[currentPlan] || "Free"}</h2>
              {currentPlan !== "free" && (
                <Chip size="sm" color={statusMeta.color} variant="soft">
                  {statusMeta.label}
                </Chip>
              )}
            </div>
            {showPeriodEnd ? (
              <p className="mt-1 text-sm text-muted">
                Access until {new Date(currentSub!.currentPeriodEnd).toLocaleDateString()}. After that, your plan will revert to Free.
              </p>
            ) : status === "past_due" ? (
              <p className="mt-1 text-sm text-warning">
                We couldn&apos;t process your last payment. Please update your payment method to keep access.
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {currentPlan === "free" ? "You're on the free plan." : "Your subscription is active."}
              </p>
            )}
          </div>
          {canCancel && (
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={() => cancelModal.open()}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Cancel subscription
              </button>
              <button
                onClick={() => refundModal.open()}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                Request refund
              </button>
            </div>
          )}
        </div>
      )}

      {/* Plan cards */}
      {!loading && !loadError && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">Available plans</h2>
            {hasAnnual && (
              <div className="inline-flex rounded-md border border-border p-0.5">
                <button className={toggleClass(interval === "month")} onClick={() => setBillingInterval("month")}>
                  Monthly
                </button>
                <button className={toggleClass(interval === "year")} onClick={() => setBillingInterval("year")}>
                  Annual
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
              const copy = PLAN_COPY[plan.id];

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
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Popular</span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Current</span>
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
                      Cancel anytime. No commitment.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Cancel modal */}
      <Dialog state={cancelModal} title="Cancel subscription">
        <p className="text-sm text-muted">
          Are you sure? You&apos;ll keep access to your paid features until the end
          of your billing period.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => cancelModal.close()} isDisabled={actionLoading}>Keep plan</Button>
          <Button variant="danger" size="sm" onPress={confirmCancel} isDisabled={actionLoading}>
            {actionLoading ? "Cancelling..." : "Cancel subscription"}
          </Button>
        </div>
      </Dialog>

      {/* Refund modal */}
      <Dialog state={refundModal} title="Request a refund">
        <p className="text-sm text-muted">
          We&apos;ll refund your most recent payment in full and cancel your
          subscription immediately. Refunds are available within 14 days of the
          payment.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onPress={() => refundModal.close()} isDisabled={actionLoading}>Keep plan</Button>
          <Button variant="danger" size="sm" onPress={confirmRefund} isDisabled={actionLoading}>
            {actionLoading ? "Processing..." : "Refund & cancel"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
