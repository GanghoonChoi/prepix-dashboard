"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@heroui/react";
import { authService } from "@/lib/api/services/auth.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useT } from "@/lib/i18n/context";

function ResetPasswordForm() {
  const t = useT();
  usePageTitle(t("auth.chooseNewPassword"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState("");

  const inputClass =
    "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted outline-none transition-colors focus:border-foreground/30";

  if (!token) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("auth.invalidResetLink")}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {t("auth.invalidResetLinkBody")}
          </p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          onPress={() => router.replace("/forgot-password")}
        >
          {t("auth.requestNewLink")}
        </Button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError(t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("auth.passwordsMismatch"));
      return;
    }

    setIsLoading(true);
    try {
      await authService.resetPassword(token, password);
      setIsDone(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(
        axiosErr.response?.data?.message || t("auth.resetPasswordFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isDone) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t("auth.passwordUpdated")}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {t("auth.passwordUpdatedBody")}
          </p>
        </div>
        <Button
          variant="primary"
          className="w-full"
          onPress={() => router.replace("/login")}
        >
          {t("auth.goToSignIn")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("auth.chooseNewPassword")}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("auth.enterNewPasswordBody")}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-foreground">
            {t("auth.newPassword")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
            minLength={8}
            maxLength={100}
            placeholder={t("auth.passwordPlaceholderHint")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="block text-sm font-medium text-foreground">
            {t("auth.confirmNewPassword")}
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            maxLength={100}
            placeholder={t("auth.reenterPasswordPlaceholder")}
            className={inputClass}
          />
        </div>
        {error && (
          <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          isDisabled={isLoading}
        >
          {isLoading ? t("auth.updatingPassword") : t("auth.updatePasswordButton")}
        </Button>
      </form>

      <p className="text-sm text-muted">
        <Link href="/login" className="text-foreground underline underline-offset-4 hover:no-underline">
          {t("auth.backToSignIn")}
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
