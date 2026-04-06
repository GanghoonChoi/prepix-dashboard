"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ProgressBar, ProgressBarTrack, ProgressBarFill } from "@heroui/react";
import confetti from "canvas-confetti";
import { LoadingScreen } from "@/components/loading-screen";
import { PasswordRequirements } from "@/components/auth/password-requirements";
import { authService } from "@/lib/api/services/auth.service";
import { sleep } from "@/lib/utils";

const TOTAL_STEPS = 4;

const STEP_INFO: Record<number, { title: string; description: string }> = {
  1: { title: "Create your account", description: "Enter your email to get started" },
  2: { title: "Choose a username", description: "This is how others will see you" },
  3: { title: "Set a password", description: "Must be at least 8 characters" },
  4: { title: "Confirm details", description: "Review and create your account" },
};

export default function SignupPage() {
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
      if (password !== confirmPassword) { setError("Passwords do not match"); return; }
      if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
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
        setError(axiosErr.response?.data?.message || "Registration failed");
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
    return <LoadingScreen title="Setting up your workspace" subtitle="This will only take a moment..." />;
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
          <ProgressBar aria-label="Progress" value={(step / TOTAL_STEPS) * 100} size="sm">
            <ProgressBarTrack><ProgressBarFill /></ProgressBarTrack>
          </ProgressBar>
          <p className="mt-1.5 text-xs text-muted">Step {step} of {TOTAL_STEPS}</p>
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
              <label htmlFor="email" className="block text-sm font-medium text-foreground">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus placeholder="you@example.com" className={inputClass} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-sm font-medium text-foreground">Username</label>
              <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus placeholder="johndoe" className={inputClass} />
              <p className="text-xs text-muted">Optional. You can change this later.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
                <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus placeholder="At least 8 characters" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground">Confirm password</label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required placeholder="Re-enter password" className={inputClass} />
              </div>
              <PasswordRequirements password={password} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-md border border-border divide-y divide-border">
                {[
                  ["Email", email],
                  ["Username", username || "—"],
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
                  I agree to the{" "}
                  <Link href="/terms" className="underline underline-offset-2 hover:text-foreground" target="_blank">Terms</Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground" target="_blank">Privacy Policy</Link>
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {step > 1 && (
            <Button type="button" variant="outline" className="flex-1" onPress={handleBack} isDisabled={isLoading || isAnimating}>
              Back
            </Button>
          )}
          <Button type="submit" variant="primary" className="flex-1" isDisabled={isLoading || isAnimating}>
            {isLoading ? "Creating account..." : step < TOTAL_STEPS ? "Continue" : "Create account"}
          </Button>
        </div>
      </form>

      {/* Footer */}
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:no-underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
