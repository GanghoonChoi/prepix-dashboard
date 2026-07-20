"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ProgressBar, ProgressBarTrack, ProgressBarFill } from "@heroui/react";
import confetti from "canvas-confetti";
import { LoadingScreen } from "@/components/loading-screen";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { authService } from "@/lib/api/services/auth.service";
import { sleep } from "@/lib/utils";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useT } from "@/lib/i18n/context";

const TOTAL_STEPS = 4;

export default function SignupPage() {
  const t = useT();
  usePageTitle(t("auth.createAccount"));
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [error, setError] = useState("");

  const STEP_INFO: Record<number, { title: string; description: string }> = {
    1: { title: t("auth.step1Title"), description: t("auth.step1Desc") },
    2: { title: t("auth.step2Title"), description: t("auth.step2Desc") },
    3: { title: t("auth.step3Title"), description: t("auth.step3Desc") },
    4: { title: t("auth.step4Title"), description: t("auth.step4Desc") },
  };

  // Already signed in? Skip signup.
  useEffect(() => {
    if (localStorage.getItem("accessToken") || localStorage.getItem("refreshToken")) {
      router.replace("/dashboard");
    }
  }, [router]);

  const fireConfetti = () => {
    const duration = 3000;
    const end = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };
    const rand = (min: number, max: number) => Math.random() * (max - min) + min;
    const interval = window.setInterval(() => {
      const left = end - Date.now();
      if (left <= 0) return clearInterval(interval);
      const count = 50 * (left / duration);
      confetti({ ...defaults, particleCount: count, origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount: count, origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);
  };

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step === 3) {
      if (password !== confirmPassword) { setError(t("auth.passwordsMismatch")); return; }
      if (password.length < 8) { setError(t("auth.passwordMinLength")); return; }
    }

    if (step === TOTAL_STEPS) {
      setIsLoading(true);
      try {
        await authService.register({ email, password, username: username || undefined });
        const loginData = await authService.login({ email, password });
        localStorage.setItem("accessToken", loginData.accessToken);
        localStorage.setItem("refreshToken", loginData.refreshToken);
        if (loginData.user) localStorage.setItem("userInfo", JSON.stringify(loginData.user));

        setIsLoading(false);
        fireConfetti();
        await sleep(800);
        setIsSettingUp(true);
        await sleep(2000);
        router.push("/dashboard");
        return;
      } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { message?: string } } };
        setError(axiosErr.response?.data?.message || t("auth.registrationFailed"));
        setIsLoading(false);
        return;
      }
    }

    setIsAnimating(true);
    await sleep(250);
    setStep(step + 1);
    setIsAnimating(false);
  };

  const handleBack = async () => {
    if (step > 1) {
      setIsAnimating(true);
      await sleep(250);
      setStep(step - 1);
      setIsAnimating(false);
    }
  };

  if (isSettingUp) {
    return <LoadingScreen title={t("auth.settingUpWorkspace")} subtitle={t("auth.settingUpSubtitle")} />;
  }

  const info = STEP_INFO[step];
  const inputClass =
    "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-foreground/30";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {info.title}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{info.description}</p>
        <div className="mt-4">
          <ProgressBar aria-label={t("auth.progressAriaLabel")} value={(step / TOTAL_STEPS) * 100} size="sm">
            <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
          </ProgressBar>
          <p className="mt-1.5 text-xs text-muted">{t("auth.stepOf", { step, total: TOTAL_STEPS })}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleNext} className="space-y-5">
        <div className={`transition-all duration-250 ${isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"}`}>
          {step === 1 && (
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-foreground">{t("auth.email")}</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder={t("auth.emailPlaceholder")} className={inputClass} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-sm font-medium text-foreground">{t("auth.username")}</label>
              <input id="username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder={t("auth.usernamePlaceholder")} className={inputClass} />
              <p className="text-xs text-muted">{t("auth.usernameHint")}</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">{t("auth.password")}</label>
                <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder={t("auth.passwordPlaceholderHint")} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">{t("auth.confirmPassword")}</label>
                <input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder={t("auth.reenterPasswordPlaceholder")} className={inputClass} />
              </div>
              <PasswordRequirements password={password} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-md border border-border divide-y divide-border">
                {[
                  [t("auth.email"), email],
                  [t("auth.username"), username || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-muted">{k}</span>
                    <span className="text-sm font-medium text-foreground">{v}</span>
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  required
                  className="mt-0.5 h-4 w-4 rounded border-border accent-foreground"
                />
                <span className="text-sm text-muted leading-relaxed">
                  {t("auth.agreeToTermsCheckboxPrefix")}
                  <Link href="/terms" className="underline underline-offset-2 hover:text-foreground" target="_blank">{t("auth.terms")}</Link>
                  {t("auth.and")}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground" target="_blank">{t("auth.privacyPolicy")}</Link>
                  {t("auth.agreeToTermsCheckboxSuffix")}
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" className="flex-1" onPress={handleBack} isDisabled={isLoading || isAnimating}>
              {t("auth.back")}
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" isDisabled={isLoading || isAnimating}>
            {isLoading ? t("auth.creatingAccount") : step < TOTAL_STEPS ? t("auth.continue") : t("auth.createAccount")}
          </Button>
        </div>
      </form>

      {/* Google (first step only — Google provides email + name so the wizard is skipped) */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted">{t("auth.or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleSignInButton
            text="signup_with"
            onError={(m) => setError(m)}
            onSuccess={async () => {
              setError("");
              fireConfetti();
              await sleep(800);
              setIsSettingUp(true);
              await sleep(1500);
              router.push("/dashboard");
            }}
          />
        </div>
      )}

      {/* Footer */}
      <p className="text-sm text-muted">
        {t("auth.alreadyHaveAccountPrefix")}
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:no-underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </div>
  );
}
