"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Notice, inputClass } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { loginHref } from "@/lib/auth-entry";
import { authService } from "@/lib/api/services/auth.service";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { readReturnTo } from "@/lib/return-to";
import { workspaceError } from "@/lib/workspaces/onboarding";

/**
 * The sign-up code. An email sign-up lands here before /start (signup page),
 * and /start sends an account that still owes it back here. The code proves
 * the address; the server holds paid work until it is in.
 *
 * Signed in only: the code is checked against the session's own account. On
 * open it asks for a code only if none is out, so arriving straight from
 * registration (which already mailed one) does not send a second.
 */
const KNOWN = new Set([
  "EMAIL_VERIFICATION_CODE_INVALID",
  "EMAIL_VERIFICATION_CODE_EXPIRED",
  "EMAIL_VERIFICATION_RATE_LIMITED",
]);

function readEmail(): string {
  try {
    return JSON.parse(localStorage.getItem("userInfo") ?? "null")?.email ?? "";
  } catch {
    return "";
  }
}

/** Keep the cached account in step, as user.service does for useType. */
function markVerified() {
  try {
    const cached = JSON.parse(localStorage.getItem("userInfo") ?? "null");
    if (cached)
      localStorage.setItem(
        "userInfo",
        JSON.stringify({ ...cached, emailVerified: true, emailVerificationRequired: false }),
      );
  } catch {
    // A cache, nothing more.
  }
}

function CodeForm() {
  const { t, lang } = useI18n();
  usePageTitle(t("auth.verifyCodeTitle"));
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const go = useCallback(() => {
    const destination = readReturnTo();
    if (destination.startsWith("/")) router.replace(destination);
    else window.location.assign(destination);
  }, [router]);

  const explain = (e: unknown) => {
    const reason = workspaceError(e);
    return t(`auth.verifyError.${KNOWN.has(reason) ? reason : "FAILED"}`);
  };

  useEffect(() => {
    if (!(localStorage.getItem("accessToken") || localStorage.getItem("refreshToken"))) {
      router.replace(
        loginHref({ returnTo: window.location.pathname + window.location.search }),
      );
      return;
    }
    setEmail(readEmail());
    let active = true;
    authService
      .requestEmailVerification(true)
      .then((result) => {
        if (!active || !result.alreadyVerified) return;
        markVerified();
        go();
      })
      .catch((e) => active && setError(explain(e)));
    return () => {
      active = false;
    };
    // `explain` reads only `t`; a language switch must not mail again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    setBusy(true);
    setError("");
    setSent(false);
    try {
      await authService.confirmEmailCode(code);
      markVerified();
      go();
    } catch (e) {
      setError(explain(e));
      setBusy(false);
    }
  }

  async function resend() {
    setSending(true);
    setError("");
    setSent(false);
    try {
      await authService.requestEmailVerification();
      setCode("");
      setSent(true);
    } catch (e) {
      setError(explain(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("auth.verifyCodeTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-muted break-all">
          {email ? t("auth.verifyCodeSentTo", { email }) : t("auth.verifyCodeDesc")}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <Field label={t("auth.verifyCodeLabel")} htmlFor="code">
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className={`${inputClass} tabular-nums tracking-[0.3em]`}
          />
        </Field>
        {error && <Notice tone="danger">{error}</Notice>}
        {sent && (
          <p role="status" className="text-sm text-muted">
            {t("auth.verifyCodeResent")}
          </p>
        )}
        <Button
          type="submit"
          className="w-full"
          disabled={busy || code.length !== 6}
          aria-busy={busy}
        >
          {busy ? t("auth.verifyCodeChecking") : t("auth.verifyCodeSubmit")}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Button variant="secondary" disabled={sending} aria-busy={sending} onClick={resend}>
          {t("auth.verifyCodeResend")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            authService.logout();
            router.replace(loginHref({ lang }));
          }}
        >
          {t("auth.verifyCodeOtherAccount")}
        </Button>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <CodeForm />
    </Suspense>
  );
}
