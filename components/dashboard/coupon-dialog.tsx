"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type UseOverlayStateReturn } from "@heroui/react";
import { BadgePercent, Check, Clock, Ticket } from "lucide-react";
import { Dialog } from "@/components/dialog";
import { useI18n } from "@/lib/i18n/context";
import {
  couponService,
  refusalOf,
  type CouponBenefit,
} from "@/lib/api/services/coupon.service";

type Step = "enter" | "review" | "done";

/**
 * Enter a code, see exactly what it gives, then apply it.
 *
 * Two steps on purpose: a plan pass changes the account the moment it is
 * applied, so the person sees the dates and what happens after before it
 * does. The review step is a preview the server wrote nothing for.
 */
export function CouponDialog({
  state,
  initialCode,
  onApplied,
  onSubscribe,
}: {
  state: UseOverlayStateReturn;
  /** From a `/redeem?code=` link: filled in and checked as the dialog opens. */
  initialCode?: string | null;
  onApplied: (benefit: CouponBenefit) => void;
  /** For a discount: go straight to checkout for the plan it is for. */
  onSubscribe: (planId: string) => void;
}) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState<Step>("enter");
  const [code, setCode] = useState("");
  const [benefit, setBenefit] = useState<CouponBenefit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Whether a pass would start after the one already running, decided when
  // the code is checked (render must not read the clock).
  const [stacked, setStacked] = useState(false);
  const autoChecked = useRef<string | null>(null);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const reset = () => {
    setStep("enter");
    setCode("");
    setBenefit(null);
    setError(null);
    setBusy(false);
  };

  const check = async (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      const preview = await couponService.preview(value);
      if (preview.valid) {
        setBenefit(preview.benefit);
        setStacked(
          preview.benefit.kind === "plan_pass" &&
            new Date(preview.benefit.startsAt).getTime() > Date.now() + 60_000,
        );
        setStep("review");
      } else if (preview.reason === "not_for_this_account" && preview.detail) {
        setError(t("coupon.err.not_for_this_domain", { domain: `@${preview.detail}` }));
      } else {
        setError(t(`coupon.err.${preview.reason}`));
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(t(status === 429 ? "coupon.err.tooMany" : "coupon.err.generic"));
    }
    setBusy(false);
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      const applied = await couponService.redeem(code.trim());
      setBenefit(applied);
      setStep("done");
      onApplied(applied);
    } catch (err) {
      // Someone else took the last one between preview and apply, and so on.
      const reason = refusalOf(err);
      setError(t(reason ? `coupon.err.${reason}` : "coupon.err.generic"));
      setStep("enter");
    }
    setBusy(false);
  };

  // A link brings the code with it: fill it in and check it once.
  useEffect(() => {
    if (!state.isOpen) {
      reset();
      autoChecked.current = null;
      return;
    }
    if (initialCode && autoChecked.current !== initialCode) {
      autoChecked.current = initialCode;
      const normalized = initialCode.toUpperCase().replace(/\s+/g, "");
      setCode(normalized);
      void check(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isOpen, initialCode]);

  return (
    <Dialog state={state} title={step === "done" ? t("coupon.applied") : t("coupon.title")}>
      {step === "enter" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check(code);
          }}
        >
          <label className="block">
            <span className="text-xs text-muted">{t("coupon.codeLabel")}</span>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
                setError(null);
              }}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "coupon-error" : "coupon-hint"}
              placeholder="PREPIX-XXXXXXXXXX"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm tracking-wider text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-foreground/20 aria-[invalid]:border-danger/60"
            />
          </label>
          {error ? (
            <p id="coupon-error" role="alert" className="mt-2 text-xs text-danger">
              {error}
            </p>
          ) : (
            <p id="coupon-hint" className="mt-2 text-xs text-muted">
              {t("coupon.codeHint")}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <Button type="submit" variant="primary" size="sm" isDisabled={busy || !code.trim()}>
              {busy ? t("coupon.checking") : t("coupon.check")}
            </Button>
          </div>
        </form>
      )}

      {step === "review" && benefit && (
        <>
          <BenefitCard benefit={benefit} date={date} stacked={stacked} />
          {error && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-between gap-3">
            <Button variant="ghost" size="sm" onPress={reset} isDisabled={busy}>
              {t("coupon.otherCode")}
            </Button>
            <Button variant="primary" size="sm" onPress={apply} isDisabled={busy}>
              {busy ? t("coupon.applying") : t("coupon.apply")}
            </Button>
          </div>
        </>
      )}

      {step === "done" && benefit && (
        <>
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-success/15 text-success">
              <Check size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <p className="pt-1.5 text-sm text-foreground">
              {benefit.kind === "plan_pass"
                ? t("coupon.donePass", { plan: benefit.planName, date: date(benefit.endsAt) })
                : benefit.kind === "minutes"
                  ? t("coupon.doneMinutes", { minutes: String(benefit.minutes), date: date(benefit.expiresAt) })
                  : t("coupon.doneDiscount", { percent: String(benefit.percent), date: date(benefit.expiresAt) })}
            </p>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            {benefit.kind === "discount" ? (
              <>
                <Button variant="outline" size="sm" onPress={() => state.close()}>
                  {t("coupon.later")}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => {
                    state.close();
                    onSubscribe(benefit.plan);
                  }}
                >
                  {t("coupon.subscribeWithDiscount")}
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onPress={() => state.close()}>
                {t("coupon.close")}
              </Button>
            )}
          </div>
        </>
      )}
    </Dialog>
  );
}

function BenefitCard({
  benefit,
  date,
  stacked,
}: {
  benefit: CouponBenefit;
  date: (iso: string) => string;
  stacked: boolean;
}) {
  const { t } = useI18n();
  const Icon = benefit.kind === "plan_pass" ? Ticket : benefit.kind === "minutes" ? Clock : BadgePercent;

  let title: string;
  let lines: string[];
  if (benefit.kind === "plan_pass") {
    title = t("coupon.passTitle", { plan: benefit.planName, days: String(benefit.days) });
    lines = [
      stacked ? t("coupon.passLineStacked") : t("coupon.passLine1"),
      t("coupon.passLine2", { date: date(benefit.endsAt) }),
    ];
  } else if (benefit.kind === "minutes") {
    title = t("coupon.minutesTitle", { minutes: String(benefit.minutes) });
    lines = [t("coupon.minutesLine1"), t("coupon.minutesLine2", { date: date(benefit.expiresAt) })];
  } else {
    title = t("coupon.discountTitle", { plan: benefit.planName, percent: String(benefit.percent) });
    lines = [t("coupon.discountLine1"), t("coupon.discountLine2", { date: date(benefit.expiresAt) })];
  }

  return (
    <div className="flex gap-4 rounded-lg border border-border bg-surface p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-secondary text-foreground">
        <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-base font-semibold text-foreground">{title}</p>
        <ul className="mt-2 space-y-1">
          {lines.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-muted">
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
