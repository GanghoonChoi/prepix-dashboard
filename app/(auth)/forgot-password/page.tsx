"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@heroui/react";
import { authService } from "@/lib/api/services/auth.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";
import { loginHref } from "@/lib/auth-entry";
import { Turnstile } from "@/components/auth/turnstile";

export default function ForgotPasswordPage() {
  const { t, lang } = useI18n();
  usePageTitle(t("auth.resetPassword"));
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  /*
   * This form is Turnstile-gated because it is the bigger of the two mail
   * paths: a scripted reset request mails a link to whatever address it is
   * handed, and four weeks of sending was 82% exactly that.
   */
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await authService.requestPasswordReset(email, turnstileToken ?? undefined);
      setIsSubmitted(true);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: string } };
      };
      // The backend returns a generic 200 even when the email is unknown, so
      // anything reaching here is transport-level — or the guard, which is the
      // one case the reader can act on.
      setError(
        axiosErr.response?.status === 403
          ? t("auth.verificationFailed")
          : axiosErr.response?.data?.message || t("auth.resetLinkSendFailed"),
      );
      // The token left with the request and is spent either way.
      setTurnstileReset((n) => n + 1);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {isSubmitted ? t("auth.checkYourEmail") : t("auth.resetPassword")}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {isSubmitted
            ? t("auth.resetLinkSentTo", { email })
            : t("auth.enterEmailForReset")}
        </p>
      </div>

      {isSubmitted ? (
        <div className="space-y-4">
          <div className="rounded-md border border-border px-4 py-3 text-sm text-muted">
            {t("auth.didntReceiveEmailPrefix")}
            <button
              onClick={() => {
                setIsSubmitted(false);
                setError("");
              }}
              className="text-foreground underline underline-offset-2"
            >
              {t("auth.tryAgain")}
            </button>
          </div>
          <Button
            variant="primary"
            className="w-full"
            onPress={() => (window.location.href = "/login")}
          >
            {t("auth.backToSignIn")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-medium text-foreground">
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder={t("auth.emailPlaceholder")}
              className={inputClass}
            />
          </div>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              {error}
            </div>
          )}
          <Turnstile
            action="password-reset"
            onToken={setTurnstileToken}
            resetKey={turnstileReset}
          />
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            isDisabled={isLoading}
          >
            {isLoading ? t("auth.sending") : t("auth.sendResetLink")}
          </Button>
        </form>
      )}

      <p className="text-sm text-muted">
        <Link href={loginHref({ lang })} className="text-foreground underline underline-offset-4 hover:no-underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}
