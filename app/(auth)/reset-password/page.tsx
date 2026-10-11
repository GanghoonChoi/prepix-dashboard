"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { authService } from "@/lib/api/services/auth.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { useI18n } from "@/lib/i18n/context";
import { loginHref } from "@/lib/auth-entry";

function ResetPasswordForm() {
  const { t, lang } = useI18n();
  usePageTitle(t("auth.chooseNewPassword"));
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState("");

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
          className="w-full"
          onClick={() => router.replace("/forgot-password")}
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
          className="w-full"
          onClick={() => router.replace("/login")}
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
        <Field label={t("auth.newPassword")} htmlFor="password">
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
        </Field>
        <Field label={t("auth.confirmNewPassword")} htmlFor="confirm">
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
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {isLoading ? t("auth.updatingPassword") : t("auth.updatePasswordButton")}
        </Button>
      </form>

      <p className="text-sm text-muted">
        <Link href={loginHref({ lang })} className="text-foreground underline underline-offset-4 hover:no-underline">
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
