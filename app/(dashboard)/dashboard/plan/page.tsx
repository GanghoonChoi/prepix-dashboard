"use client";

import { useState, useEffect } from "react";
import { Skeleton } from "@heroui/react";
import { Check, Ticket } from "lucide-react";
import {
  subscriptionService,
  type CatalogPlan,
  type CurrentSubscription,
} from "@/lib/api/services/subscription.service";
import { PLAN_NAMES, PLAN_COPY, PLAN_STATUS_META, formatPrice } from "@/lib/constants/data";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useToast } from "@/components/toast";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import Link from "next/link";
import { startHref } from "@/lib/onboarding";
import { useI18n } from "@/lib/i18n/context";
import { RefundRequestCard } from "@/components/dashboard/refund-request-card";
import { legalUrl } from "@/lib/i18n/config";
import { CouponDialog } from "@/components/dashboard/coupon-dialog";
import { UsageSection } from "@/components/dashboard/usage-card";
import { useSearchParams } from "next/navigation";
import { couponService, type CouponBenefits } from "@/lib/api/services/coupon.service";
import {
  Badge,
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  buttonClass,
  cardClass,
  textareaClass,
  type Tone,
  InfoTip,
} from "@/components/ui";
import { Block } from "@/components/workspaces/shared";
import { formatDay, formatMoney } from "@/lib/format";

export default function PlanPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("plan.title"));
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentSub, setCurrentSub] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  // The same catalog as the default processor would quote it, for a buyer in
  // Korea whose card is foreign-issued: the domestic processor takes won on
  // Korean cards only, so they need a way to the dollar price that is not a dead end.
  const [intlPlans, setIntlPlans] = useState<CatalogPlan[]>([]);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const cancelModal = useOverlayState();
  const refundModal = useOverlayState();
  const reviewModal = useOverlayState();
  const supportModal = useOverlayState();
  const couponModal = useOverlayState();
  const [reviewNote, setReviewNote] = useState("");
  // What coupons currently give this account. A page that cannot load them
  // still works — they are an addition, not the plan.
  const [benefits, setBenefits] = useState<CouponBenefits | null>(null);
  // From a `/redeem?code=` link, carried through sign-in.
  const [linkedCoupon, setLinkedCoupon] = useState<string | null>(null);

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
        // Only worth asking when this buyer is being quoted won.
        if (catalog.some((p) => p.prices.some((pr) => pr.currency === "KRW" && p.id !== "free"))) {
          subscriptionService.getPlans("INTL").then(setIntlPlans).catch(() => setIntlPlans([]));
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    couponService.benefits().then(setBenefits).catch(() => setBenefits(null));
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
      const coupon = params.get("coupon");
      if (coupon) {
        setLinkedCoupon(coupon);
        couponModal.open();
        // Out of the address bar, so a reload does not apply it again.
        params.delete("coupon");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    }
    // Once, on arrival: it reads the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ?redeem=1 — "쿠폰 등록" from home or ⌘K. Watched rather than read once,
  // because ⌘K can send it while this page is already open.
  const redeem = useSearchParams().get("redeem");
  useEffect(() => {
    if (redeem !== "1") return;
    setLinkedCoupon(null);
    couponModal.open();
    const params = new URLSearchParams(window.location.search);
    params.delete("redeem");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeem]);

  // Back from a hosted checkout. Toss has already written the plan by the time
  // the buyer arrives, but the others tell us through a webhook that can trail
  // the redirect by seconds — so keep asking, briefly, instead of leaving a
  // paid customer looking at the free plan until they think to refresh.
  useEffect(() => {
    if (!justUpgraded) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      try {
        const sub = await subscriptionService.getCurrent();
        setCurrentSub(sub);
        if (sub.plan !== "free") clearInterval(id);
      } catch {
        /* keep the view we have; the next tick or a reload reconciles */
      }
      if (tries >= 10) clearInterval(id);
    }, 2000);
    return () => clearInterval(id);
  }, [justUpgraded]);

  // After a coupon is applied: the plan, its prices and the benefits list can
  // all have changed. Not a full reload — the dialog is still showing.
  const refreshAfterCoupon = () => {
    Promise.all([subscriptionService.getCurrent(), subscriptionService.getPlans()])
      .then(([sub, catalog]) => {
        setCurrentSub(sub);
        setPlans(catalog);
      })
      .catch(() => {});
    couponService.benefits().then(setBenefits).catch(() => {});
  };

  const handleUpgrade = async (planId: string, country?: string) => {
    setActionLoading(true);
    try {
      const result = await subscriptionService.checkout(planId, "month", country);
      // Only Paddle has an in-page overlay, and it is opened against the
      // SERVER-CREATED transaction (client-side creation via `items` is blocked
      // for this vendor). Every other processor hosts its own checkout page, so
      // the id below belongs to them and handing it to Paddle.js would only
      // raise an error — hence the provider gate. On completion the layout's
      // eventCallback reloads the page.
      if (
        result.provider === "paddle" &&
        result.transactionId &&
        window.Paddle &&
        window.__paddleReady
      ) {
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
        // The normal path for Creem and Lemon Squeezy, and Paddle's fallback
        // when its script has not loaded. Full-page navigation to a hosted
        // checkout — not React state.
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

  // The half-refund band and anything else a person has to size. Files the
  // request and notifies the team; nothing is refunded here, so the toast must
  // not read like it was — a customer who thinks the money is on its way and
  // then waits two days is the one who calls their bank.
  const submitSupportRequest = async () => {
    await fileRefundRequest(supportModal);
  };

  const submitRefundReview = async () => {
    await fileRefundRequest(reviewModal);
  };

  const fileRefundRequest = async (modal: { close: () => void }) => {
    setActionLoading(true);
    try {
      const res = await subscriptionService.requestRefundReview(
        reviewNote.trim() || undefined,
      );
      modal.close();
      setReviewNote("");
      toast(res?.alreadyFiled ? t("plan.reviewAlreadyFiledToast") : t("plan.reviewFiledToast"));
      // Refreshes into the pending state, so the control the user just used is
      // gone by the time the toast fades.
      await refreshCurrent();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast(axiosErr.response?.data?.message || t("plan.refundFailed"), "error");
    }
    setActionLoading(false);
  };

  const currentPlan = currentSub?.plan || "free";
  const status = currentSub?.status ?? "active";
  const statusMeta = PLAN_STATUS_META[status];
  const statusLabel = statusMeta ? t(statusMeta.labelKey) : status;
  const statusColor = statusMeta?.color ?? "default";
  const statusTone: Tone = statusColor === "default" ? "neutral" : statusColor;
  const periodEndLabel = currentSub?.currentPeriodEnd
    ? formatDay(currentSub.currentPeriodEnd, lang)
    : null;
  // Only a pending cancel keeps access until the period end. canceled/refunded/
  // chargeback mean access has already ended.
  const showPeriodEnd = status === "pending_cancel" && !!periodEndLabel;
  const isEnded = ["canceled", "refunded", "chargeback"].includes(status);
  // Only a live Paddle subscription can be cancelled. A tier granted by hand
  // (comp/promo) reports manageable: false — offering "Cancel" there would only
  // 400, since there is no subscription behind it.
  // A subscription on a closed processor (Paddle) will never renew: nothing
  // to cancel, and the way to keep the plan is to subscribe again.
  const stranded = currentSub?.manageable === true && currentSub.renews === false && !isEnded;
  const canCancel =
    currentSub?.manageable === true &&
    !stranded &&
    ["active", "trialing", "past_due"].includes(status);
  // Three affordances, not one, because the policy has three bands: refund now,
  // ask us to review, or nothing here. The backend decides which — rendering a
  // button whose request would only 4xx is how people end up at their bank
  // instead of at us.
  const refundOffer = currentSub?.refund;
  const canRefund = refundOffer?.action === "self-serve";
  const canRequestReview = refundOffer?.action === "request-review";
  // A payment we can't judge automatically still has a person behind it, and a
  // statutory right or a service fault is refundable whatever the band says.
  // Showing nothing here is how someone concludes there is no way to reach us
  // and calls their bank instead — so these reasons get a route, not silence.
  // The other reasons (no subscription, nothing charged) have no payment to
  // talk about, and a refund link on those is just confusing.
  const needsSupport = refundOffer?.action === "contact-support";
  // A filed request replaces every control: the question this person has is
  // "did it go through", and another button answers the wrong one.
  const refundPending = refundOffer?.action === "pending";
  // The plan is held by a coupon pass, not by a subscription.
  const pass = benefits?.pass ?? null;
  const onPass = !!pass && pass.plan === currentPlan && !currentSub?.manageable;
  const shortDate = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  // A price lock's `until` is exclusive; people read the last day it covers.
  const lastDay = (iso: string) => shortDate(new Date(new Date(iso).getTime() - 1).toISOString());
  const planName = (id: string) => plans.find((p) => p.id === id)?.displayName ?? PLAN_NAMES[id] ?? id;
  // A pass that holds the current plan is already the status line above it.
  const passBenefit = onPass ? null : (benefits?.pass ?? null);
  const locks = benefits?.locks ?? [];
  const hasBenefits =
    !!benefits &&
    (!!passBenefit || benefits.credits.remainingSeconds > 0 || benefits.discounts.length > 0 || locks.length > 0);
  // Only what the name and status pill do not already say.
  const statusLine = showPeriodEnd
    ? t("plan.accessUntil", { date: periodEndLabel! })
    : isEnded
      ? t("plan.ended")
      : status === "past_due"
        ? t("plan.pastDue")
        : onPass
          ? t("coupon.planPassActive", { plan: planName(pass!.plan), date: shortDate(pass!.endsAt) })
          : stranded
            ? t("plan.resubscribeNeeded")
            : null;
  // A live subscription with nothing else to say renews at the period end.
  const renewsLine =
    !statusLine && canCancel && periodEndLabel ? t("dashboard.renews", { date: periodEndLabel }) : null;
  const updatesCard = status === "past_due" && currentSub?.provider === "tosspayments";
  // Won the way the dashboard writes money (lib/format); other currencies as before.
  const money = (currency: string, amount: number) =>
    currency === "KRW" ? formatMoney(amount, lang) : formatPrice(currency, amount);

  // The dollar price of a plan for a card issued abroad, or null when there is
  // nothing to offer (not quoted in won, or no such price).
  const foreignCardPrice = (plan: CatalogPlan): string | null => {
    const quoted = plan.prices.find((p) => p.interval === "month");
    if (!quoted || quoted.currency !== "KRW") return null;
    const abroad = intlPlans
      .find((p) => p.id === plan.id)
      ?.prices.find((p) => p.interval === "month" && p.currency !== "KRW");
    if (!abroad) return null;
    const pct = abroad.launchDiscountPercent ?? 0;
    return formatPrice(abroad.currency, pct ? Math.round(abroad.unitAmount * (1 - pct / 100)) : abroad.unitAmount);
  };

  const priceLabel = (plan: CatalogPlan) => {
    if (plan.status === "coming_soon")
      return {
        big: t("plan.comingSoon"),
        per: null as string | null,
        strike: null as string | null,
        sub: null as string | null,
      };
    const price = plan.prices.find((p) => p.interval === "month") ?? plan.prices[0];
    // The catalog only carries prices for the processor that would take THIS
    // buyer's money, so a paid tier can come back with none — that is a
    // misconfiguration, not a free plan, and rendering it as ₩0 quotes a price
    // we will never honour.
    if (!price) {
      return plan.id === "free"
        ? { big: money("KRW", 0), per: null, strike: null, sub: null }
        : { big: t("plan.priceUnavailable"), per: null, strike: null, sub: null };
    }

    const pct = price.launchDiscountPercent ?? 0;
    const net = pct ? Math.round(price.unitAmount * (1 - pct / 100)) : price.unitAmount;
    const per = price.interval === "year" ? t("plan.perYear") : t("plan.perMonth");
    const strike = pct ? money(price.currency, price.unitAmount) : null;

    // "/월" already says monthly; the line under it only speaks when there is
    // something the price alone does not say.
    let sub: string | null;
    if (price.interval === "year") {
      const perMonth = money(price.currency, Math.round(net / 12));
      const prefix = pct ? t("plan.launchPrefix", { pct }) : "";
      sub = prefix + t("plan.annualSuffix", { perMonth });
    } else {
      sub = pct ? t("plan.launchMonthly", { pct }) : null;
    }
    // A price lock holds every payment until its date — and says when it
    // stops and what comes after, so it never reads as the price for good.
    const lock = price.interval === "month" ? price.couponLock : null;
    if (lock) {
      return {
        big: money(price.currency, lock.amount),
        per,
        strike: money(price.currency, net),
        sub: t("coupon.priceUntilLock", { date: lastDay(lock.until), price: money(price.currency, net), per }),
        chip: t("coupon.lockChip"),
        note: lock.minutes ? t("coupon.lockMinutes", { minutes: String(lock.minutes) }) : null,
      };
    }
    // A coupon takes money off the first month only, on top of the launch
    // promo — exactly what checkout charges. The later price is said too, so
    // the first payment never reads as the monthly price.
    const coupon = price.interval === "month" ? (price.couponDiscountPercent ?? 0) : 0;
    if (coupon) {
      const first = price.currency === "KRW"
        ? Math.round(net * (1 - coupon / 100))
        : Math.round(net * (100 - coupon)) / 100;
      return {
        big: money(price.currency, first),
        per,
        strike: money(price.currency, net),
        sub: t("coupon.priceAfterCoupon", { price: money(price.currency, net), per }),
        chip: t("coupon.chip", { percent: String(coupon) }),
      };
    }
    return { big: money(price.currency, net), per, strike, sub };
  };

  const buttonFor = (plan: CatalogPlan) => {
    const isCurrent = currentPlan === plan.id;
    // On a coupon pass, or a subscription that will never renew, the plan is
    // "current" but nothing will pay for it next — so offer to keep it.
    if (isCurrent && (onPass || stranded) && plan.prices.length > 0) {
      return {
        label: t("coupon.keepWithSubscription", { plan: plan.displayName }),
        disabled: false,
        onPress: () => handleUpgrade(plan.id),
      };
    }
    if (isCurrent) return { label: t("plan.currentPlan"), disabled: true, onPress: () => {} };
    if (plan.status === "coming_soon") return { label: t("plan.comingSoon"), disabled: true, onPress: () => {} };
    if (plan.id === "free") {
      // Only a downgrade target when there's a subscription to cancel (a
      // granted paid tier has nothing to downgrade from here).
      return { label: t("plan.downgrade"), disabled: !canCancel, onPress: () => cancelModal.open() };
    }
    if (plan.prices.length === 0) {
      // A paid tier our processor has no price for. Offering it would start a
      // checkout the server refuses; saying it is free would be a lie.
      return { label: t("plan.priceUnavailable"), disabled: true, onPress: () => {} };
    }
    // One subscription per account, and switching between paid plans is not
    // offered yet (Light joined Creator in 2026-10) — checkout would refuse it,
    // so say so rather than offer it.
    if (currentSub?.manageable && !isEnded && !stranded) {
      return { label: t("plan.switchAfterCancel"), disabled: true, onPress: () => {} };
    }
    return { label: t("plan.get", { name: plan.displayName }), disabled: false, onPress: () => handleUpgrade(plan.id) };
  };

  return (
    <div>
      <PageHeader title={t("plan.sectionTitle")} />
      <div className="space-y-8">

      {justUpgraded && (
        <Notice
          tone="success"
          role="status"
          action={
            process.env.NEXT_PUBLIC_START_ONBOARDING === "1" && (
              <Link
                className="font-medium text-foreground underline underline-offset-4"
                href={startHref({ step: "app", workspace: null, intent: null, next: null }, lang)}
              >
                {t("plan.nextApp")}
              </Link>
            )
          }
        >
          {t("plan.paymentReceived")}
        </Notice>
      )}

      {/* Current plan, and what coupons add to it — one object, not two. */}
      <Card>
        {loading ? (
          <Skeleton className="h-16 w-full rounded-md" />
        ) : loadError ? (
          <Notice
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={loadData}>
                {t("common.retry")}
              </Button>
            }
          >
            {t("plan.loadError")}
          </Notice>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              <p className="text-xs text-muted">{t("plan.currentPlan")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{PLAN_NAMES[currentPlan] || "Free"}</h2>
                {currentPlan !== "free" && (
                  <Badge tone={statusTone} dot={statusTone === "warning"}>
                    {statusLabel}
                  </Badge>
                )}
              </div>
              {(statusLine || renewsLine) && (
                <p className={`mt-1.5 text-[13px] ${status === "past_due" ? "text-warning-ink" : "text-muted"}`}>
                  {statusLine ?? renewsLine}
                </p>
              )}
            </div>
            {(updatesCard || canCancel || canRefund || canRequestReview || needsSupport || refundPending) && (
              <div className="flex flex-wrap items-center gap-2">
                {/* The domestic processor mends a failed card by registering a new
                    one; the others have no such step here. */}
                {updatesCard && (
                  <Button size="sm" disabled={actionLoading} onClick={() => handleUpgrade(currentPlan)}>
                    {t("plan.updateCard")}
                  </Button>
                )}
                {canCancel && (
                  <Button variant="ghost" size="sm" onClick={() => cancelModal.open()}>
                    {t("plan.cancelSubscription")}
                  </Button>
                )}
                {canRefund && (
                  <Button variant="ghost" size="sm" onClick={() => refundModal.open()}>
                    {t("plan.requestRefund")}
                  </Button>
                )}
                {canRequestReview && (
                  <Button variant="ghost" size="sm" onClick={() => reviewModal.open()}>
                    {t("plan.requestRefundReview")}
                  </Button>
                )}
                {needsSupport && (
                  <Button variant="ghost" size="sm" onClick={() => supportModal.open()}>
                    {t("plan.refundContactSupport")}
                  </Button>
                )}
                {refundPending && (
                  <Badge tone="warning" dot>
                    {t("plan.refundPending")}
                  </Badge>
                )}
              </div>
            )}
          </div>
        )}

        {/* What the plan gives and how much of it is left, in the same card. */}
        <div className="mt-5 space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">{t("usage.title")}</h3>
          <UsageSection />
        </div>
        {/* The coupon row: what coupons give, and where to add one. Each
            benefit with when it runs out — a benefit with no date is how
            someone gets surprised by it ending. */}
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium">{t("coupon.benefitsTitle")}</h3>
            {!loading && !loadError && hasBenefits && (
              <ul className="mt-2 space-y-1.5 text-[13px]">
                {passBenefit && (
                  <li className="flex flex-wrap justify-between gap-x-4">
                    <span>{t("coupon.benefitPass", { plan: planName(passBenefit.plan) })}</span>
                    <span className="text-muted">
                      {t("coupon.benefitPassUntil", { date: shortDate(passBenefit.endsAt) })}
                    </span>
                  </li>
                )}
                {benefits!.credits.remainingSeconds > 0 && (
                  <li className="flex flex-wrap justify-between gap-x-4">
                    <span>
                      {t("coupon.benefitMinutes", {
                        minutes: String(Math.floor(benefits!.credits.remainingSeconds / 60)),
                      })}
                    </span>
                    <span className="text-muted">
                      {t("coupon.benefitMinutesUntil", { date: shortDate(benefits!.credits.items[0].expiresAt) })}
                    </span>
                  </li>
                )}
                {locks.map((l) => (
                  <li key={`${l.plan}-${l.amount}-${l.until}`} className="flex flex-wrap justify-between gap-x-4">
                    <span>
                      {l.minutes
                        ? t("coupon.benefitLockMinutes", {
                            plan: planName(l.plan),
                            price: money("KRW", l.amount),
                            minutes: String(l.minutes),
                          })
                        : t("coupon.benefitLock", { plan: planName(l.plan), price: money("KRW", l.amount) })}
                    </span>
                    <span className="text-muted">{t("coupon.benefitLockUntil", { date: lastDay(l.until) })}</span>
                  </li>
                ))}
                {benefits!.discounts.map((d) => (
                  <li key={`${d.plan}-${d.percent}-${d.expiresAt}`} className="flex flex-wrap justify-between gap-x-4">
                    <span>{t("coupon.benefitDiscount", { percent: String(d.percent), plan: planName(d.plan) })}</span>
                    <span className="text-muted">
                      {t("coupon.benefitDiscountUntil", { date: shortDate(d.expiresAt) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onClick={() => { setLinkedCoupon(null); couponModal.open(); }}
          >
            <Ticket size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("coupon.open")}
          </Button>
        </div>
      </Card>


      {/* A filed refund request, with our reply. Sits above the plan cards
          because "what happened to my refund" outranks "what else could I buy". */}
      {refundPending && refundOffer?.pendingThreadId && (
        <RefundRequestCard
          threadId={refundOffer.pendingThreadId}
          onResolved={refreshCurrent}
        />
      )}

      {!loading && !loadError && (
        <Block title={t("plan.availablePlans")}>
          {/* One row where there is room for it. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr">
            {plans.map((plan) => {
              const isCurrent = currentPlan === plan.id;
              const emphasize = plan.id === "creator" && !isCurrent;
              const price = priceLabel(plan);
              const btn = buttonFor(plan);
              const copy = PLAN_COPY[lang][plan.id];
              const abroad = !btn.disabled && plan.id !== "free" ? foreignCardPrice(plan) : null;

              return (
                <div
                  key={plan.id}
                  className={`flex flex-col rounded-lg border bg-background p-5 ${
                    isCurrent ? "border-foreground ring-1 ring-foreground" : "border-border"
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-semibold">{plan.displayName}</p>
                      {emphasize && <Badge>{t("plan.popular")}</Badge>}
                      {/* The button says "현재 플랜" itself, except on a coupon
                          pass, where it offers to keep the plan instead. */}
                      {isCurrent && !btn.disabled && <Badge>{t("plan.current")}</Badge>}
                    </div>

                    <div className="mt-3">
                      {/* Wraps as a whole rather than breaking "/월" off the
                          price when a strike-through sits beside it. */}
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {price.strike && (
                          <span className="text-sm text-muted line-through">{price.strike}</span>
                        )}
                        <span className="whitespace-nowrap">
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">{price.big}</span>
                          {price.per && <span className="ml-0.5 text-sm text-muted">{price.per}</span>}
                        </span>
                      </div>
                      {"chip" in price && price.chip ? (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                          <Badge tone="success">{price.chip}</Badge>
                          {price.sub}
                        </p>
                      ) : (
                        price.sub && <p className="mt-1 text-xs text-muted">{price.sub}</p>
                      )}
                      {"note" in price && price.note && <p className="mt-1 text-xs text-foreground">{price.note}</p>}
                    </div>

                    {copy && (
                      <ul className="mt-4 space-y-1.5">
                        {copy.features.map((feat) => (
                          <li key={feat} className="flex items-start gap-2 text-[13px]">
                            <Check size={14} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-muted" />
                            {feat}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <Button
                    className="mt-5 w-full"
                    variant={btn.disabled ? "secondary" : "primary"}
                    disabled={btn.disabled || actionLoading}
                    onClick={btn.onPress}
                  >
                    {btn.label}
                  </Button>

                  {abroad && (
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => handleUpgrade(plan.id, "INTL")}
                      className="mt-2 text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                    >
                      {t("plan.payWithForeignCard", { price: abroad })}
                    </button>
                  )}
                </div>
              );
            })}
            {/* Business is a team plan: it is bought for the team, on the
                team's plan page, after /start has made the team. */}
            {process.env.NEXT_PUBLIC_START_ONBOARDING === "1" && (
            <div className={`${cardClass} flex flex-col gap-3 p-5`}>
              <div>
                <p className="text-base font-semibold">Business</p>
                <p className="mt-1 text-[13px] text-muted">
                  {lang === "ko"
                    ? "1인당 월 ₩129,000 · 3인 이상 · 부가세 별도"
                    : "₩129,000 per seat / month · 3+ seats · VAT extra"}
                </p>
              </div>
              <p className="text-[13px] text-muted">
                {lang === "ko"
                  ? "팀 워크스페이스, 멤버 관리, 공동 편집과 코멘트, 3TB"
                  : "Team workspace, members, co-editing and comments, 3TB"}
              </p>
              <Link
                className={`${buttonClass({ variant: "secondary" })} mt-auto w-full`}
                href={`/start?intent=team&step=workspace&locale=${lang}`}
              >
                {lang === "ko" ? "팀으로 시작하기" : "Start with your team"}
              </Link>
            </div>
            )}
          </div>

          {/* Paddle requires the buyer to accept the terms and the refund policy
              before purchase, and a refund dispute is decided against whichever
              policy we can show they saw — so the consent line and its links
              stay on screen; the policy summary is one click away. */}
          <div className="space-y-2">
            <p className="text-xs text-muted">
              {t("plan.purchaseConsent")}{" "}
              <a
                href={legalUrl(lang, "terms-of-service")}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {t("plan.termsLink")}
              </a>
              {t("plan.consentSeparator")}
              <a
                href={legalUrl(lang, "refund-policy")}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {t("plan.refundPolicyLink")}
              </a>
              {t("plan.consentSuffix")}
            </p>
            <InfoTip label={t("plan.refundTerms")} text={t("plan.refundTerms")}>
              <p>{t("plan.purchaseNotice")}</p>
            </InfoTip>
          </div>
        </Block>
      )}

      <CouponDialog
        state={couponModal}
        initialCode={linkedCoupon}
        onApplied={refreshAfterCoupon}
        onSubscribe={(planId) => handleUpgrade(planId)}
      />

      <Dialog state={cancelModal} title={t("plan.cancelModalTitle")}>
        <p className="text-sm text-muted">
          {t("plan.cancelModalBody")}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => cancelModal.close()} disabled={actionLoading}>{t("plan.keepPlan")}</Button>
          <Button variant="danger" size="sm" onClick={confirmCancel} disabled={actionLoading}>
            {actionLoading ? t("plan.cancelling") : t("plan.cancelSubscription")}
          </Button>
        </div>
      </Dialog>

      {/* Out-of-band refunds. Same submission as the review request — the
          backend files it with the facts either way and a person decides —
          but the copy must not promise a rate, because none applies here. */}
      <Dialog state={supportModal} title={t("plan.supportModalTitle")}>
        <p className="text-sm text-muted">
          {refundOffer?.reason === "used"
            ? t("plan.supportModalBodyUsed")
            : refundOffer?.reason === "previous-policy"
              ? t("plan.supportModalBodyPreviousPolicy")
              : t("plan.supportModalBodyWindowClosed")}
        </p>
        <Field label={t("plan.reviewNoteLabel")} htmlFor="support-note" className="mt-4">
          <textarea
            id="support-note"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("plan.supportNotePlaceholder")}
            className={textareaClass}
          />
        </Field>
        <p className="mt-3 text-xs text-muted">{t("plan.supportModalContact")}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => supportModal.close()} disabled={actionLoading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={submitSupportRequest} disabled={actionLoading}>
            {actionLoading ? t("plan.reviewSubmitting") : t("plan.reviewSubmit")}
          </Button>
        </div>
      </Dialog>

      {/* Review-request modal — the 50% band and anything a person has to size.
          States plainly that this is a request, and that the rate is decided on
          the request date, not the day we get to it. */}
      <Dialog state={reviewModal} title={t("plan.reviewModalTitle")}>
        <p className="text-sm text-muted">{t("plan.reviewModalBody")}</p>
        {refundOffer?.daysElapsed != null && (
          <p className="mt-2 text-xs text-muted">
            {t("plan.reviewDayCount", { days: String(refundOffer.daysElapsed) })}
          </p>
        )}
        <Field label={t("plan.reviewNoteLabel")} htmlFor="review-note" className="mt-4">
          <textarea
            id="review-note"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("plan.reviewNotePlaceholder")}
            className={textareaClass}
          />
        </Field>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => reviewModal.close()} disabled={actionLoading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={submitRefundReview} disabled={actionLoading}>
            {actionLoading ? t("plan.reviewSubmitting") : t("plan.reviewSubmit")}
          </Button>
        </div>
      </Dialog>

      {/* Refund modal */}
      <Dialog state={refundModal} title={t("plan.refundModalTitle")}>
        <p className="text-sm text-muted">
          {t("plan.refundModalBody")}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => refundModal.close()} disabled={actionLoading}>{t("plan.keepPlan")}</Button>
          <Button variant="danger" size="sm" onClick={confirmRefund} disabled={actionLoading}>
            {actionLoading ? t("plan.processing") : t("plan.refundAndCancel")}
          </Button>
        </div>
      </Dialog>
      </div>
    </div>
  );
}
