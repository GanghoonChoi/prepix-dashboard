"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { loginHref } from "@/lib/auth-entry";
import { authService } from "@/lib/api/services/auth.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import {
  TeamError,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { VerifyEmailNotice } from "@/components/workspaces/verify-email";

/**
 * Where a verification email lands.
 *
 * `?token=` rather than a path segment because that is the URL the backend
 * actually sends (`${DASHBOARD_URL}/verify-email?token=…`), matching the
 * existing `/reset-password?token=` convention. `next.config.ts` gives this
 * route `no-referrer` / `no-store` / `noindex`, which matters more for a token
 * in a query string than in a path.
 *
 * Public, not under `(dashboard)`: confirm takes the token alone and a link
 * opened in a fresh browser must not be bounced through a login form first.
 *
 * Invalid, expired and already-used are three different answers with three
 * different next actions, so they never collapse into one "try again".
 */
function Confirm() {
  const { t, lang } = useI18n();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"checking" | "done" | "failed">(
    token ? "checking" : "failed",
  );
  const [error, setError] = useState(
    token ? "" : "EMAIL_VERIFICATION_TOKEN_INVALID",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let active = true;
    authService
      .confirmEmailVerification(token)
      .then(() => {
        if (!active) return;
        setError("");
        setState("done");
      })
      .catch((e) => {
        if (!active) return;
        setError(workspaceError(e));
        setState("failed");
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  const retry = useCallback(() => {
    setState("checking");
    setAttempt((value) => value + 1);
  }, []);
  // Already verified is a success for the person holding the link, even though
  // the token itself is spent — so it does not offer a resend.
  const used = error === "EMAIL_VERIFICATION_TOKEN_USED";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("team.verifyConfirmTitle")}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {t("team.verifyConfirmDesc")}
        </p>
      </div>
      {state === "checking" && (
        <p role="status" className="text-sm">
          {t("team.verifyChecking")}
        </p>
      )}
      {state === "done" && (
        <div className="space-y-4">
          <p role="status" className="text-sm font-medium">
            {t("team.verifyDone")}
          </p>
          <p className="text-sm leading-6 text-muted">
            {t("team.verifyDoneDesc")}
          </p>
        </div>
      )}
      {state === "failed" && (
        <div className="space-y-4">
          <TeamError
            code={error}
            // Only a transport failure is worth repeating with the same token.
            retry={error === "REQUEST_FAILED" ? retry : undefined}
          />
          {/*
            An invalid or expired token needs a NEW email, which only a
            signed-in account can ask for. A spent one needs nothing.
          */}
          {!used && <VerifyEmailNotice />}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {(state === "done" || used) && (
          <Link href="/dashboard/workspaces" className={primaryClass}>
            {t("team.verifyOpenTeams")}
          </Link>
        )}
        <Link
          href={loginHref({ returnTo: "/dashboard/workspaces", lang })}
          className={secondaryClass}
        >
          {t("team.switchAccount")}
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <Confirm />
    </Suspense>
  );
}
