"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { LoadingScreen } from "@/components/loading-screen";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { authService } from "@/lib/api/services/auth.service";
import { sleep } from "@/lib/utils";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useT } from "@/lib/i18n/context";

// Only allow internal paths as a post-login destination (prevents open-redirect
// via a crafted ?returnTo=https://evil.com).
function safeReturnTo(): string {
  if (typeof window === "undefined") return "/dashboard";
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
}

export default function LoginPage() {
  const t = useT();
  usePageTitle(t("auth.signIn"));
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState("");

  // Already signed in? Skip the form.
  useEffect(() => {
    if (localStorage.getItem("accessToken") || localStorage.getItem("refreshToken")) {
      router.replace(safeReturnTo());
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const data = await authService.login({ email, password });

      if (data.accessToken && data.refreshToken) {
        localStorage.setItem("accessToken", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken);
      }

      try {
        const userInfo = data.user || (await authService.getMe());
        if (userInfo) {
          localStorage.setItem("userInfo", JSON.stringify(userInfo));
        }
      } catch {
        // non-critical
      }

      setIsLoading(false);
      setIsSigningIn(true);
      await sleep(1000);
      router.push(safeReturnTo());
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || t("auth.loginFailed"));
      setIsLoading(false);
    }
  };

  if (isSigningIn) {
    return (
      <LoadingScreen
        title={t("auth.signingYouIn")}
        subtitle={t("auth.pleaseWait")}
      />
    );
  }

  const inputClass =
    "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("auth.signIn")}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("auth.noAccountPrompt")}
          <Link href="/signup" className="text-foreground underline underline-offset-4 hover:no-underline">
            {t("auth.createOne")}
          </Link>
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-5">
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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              {t("auth.password")}
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted hover:text-foreground"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder={t("auth.passwordPlaceholderDots")}
            className={inputClass}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          className="w-full"
          isDisabled={isLoading}
        >
          {isLoading ? t("auth.signingIn") : t("auth.continue")}
        </Button>
      </form>

      {/* Google */}
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">{t("auth.or")}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <GoogleSignInButton
          text="signin_with"
          onError={(m) => setError(m)}
          onSuccess={async () => {
            setError("");
            setIsSigningIn(true);
            await sleep(800);
            router.push(safeReturnTo());
          }}
        />
      </div>

      {/* Footer */}
      <p className="text-center text-xs leading-relaxed text-muted">
        {t("auth.agreeToTermsPrefix")}
        <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">{t("auth.terms")}</Link>,{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">{t("auth.privacy")}</Link>{" "}
        &amp;{" "}
        <Link href="/refund-policy" className="underline underline-offset-2 hover:text-foreground">{t("auth.refundPolicy")}</Link>
        {t("auth.agreeToTermsSuffix")}
      </p>
    </div>
  );
}
