"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@heroui/react";
import { LoadingScreen } from "@/components/loading-screen";
import { authService } from "@/lib/api/services/auth.service";
import {
  buildCallbackUrl,
  parseLoopbackRedirect,
  readAttributionId,
  readConnectRequest,
  type ConnectRequest,
} from "@/lib/device-connect";
import { usePageTitle } from "@/lib/hooks/use-page-title";
import { loginHref } from "@/lib/auth-entry";
import { useT } from "@/lib/i18n/context";

/**
 * "Connect the Prepix app to this account."
 *
 * The desktop app used to send people here to sign up and then made them come
 * back and retype the password they had just chosen — it has no way to create
 * an account and no way to receive a session. This page is the return path.
 *
 * It is deliberately a CONFIRMATION, not an automatic redirect. The app can
 * open any URL it likes in the browser; the person should get to see which
 * account is about to be handed over, on a page with an address bar they can
 * read. That is most of what this flow buys over typing a password into an
 * app window.
 */

type Phase = "checking" | "confirm" | "connecting" | "done" | "invalid" | "error";

export default function ConnectPage() {
  const t = useT();
  usePageTitle(t("connect.title"));

  const [phase, setPhase] = useState<Phase>("checking");
  const [request, setRequest] = useState<ConnectRequest | null>(null);
  const [account, setAccount] = useState<string>("");
  const [error, setError] = useState("");

  useEffect(() => {
    const parsed = readConnectRequest(window.location.search);
    if (!parsed) {
      setPhase("invalid");
      return;
    }
    setRequest(parsed);

    // Not signed in → send them through the normal login, then straight back
    // here with the request intact. `safeReturnTo` on the login page only
    // accepts internal paths, and this is one.
    const signedIn =
      localStorage.getItem("accessToken") || localStorage.getItem("refreshToken");
    if (!signedIn) {
      const returnTo = window.location.pathname + window.location.search;
      window.location.replace(loginHref({ returnTo }));
      return;
    }

    try {
      const cached = JSON.parse(localStorage.getItem("userInfo") || "null");
      if (cached?.email) setAccount(cached.email);
    } catch {
      /* the email is a courtesy on the confirm screen, not a requirement */
    }

    setPhase("confirm");
  }, []);

  // Fill in the account line from the server when there was nothing cached,
  // so the confirmation never says "connect as (blank)".
  useEffect(() => {
    if (phase !== "confirm" || account) return;
    let cancelled = false;
    authService
      .getMe()
      .then((me: { email?: string }) => {
        if (!cancelled && me?.email) setAccount(me.email);
      })
      .catch(() => {
        /* the interceptor handles a dead session; nothing to add here */
      });
    return () => {
      cancelled = true;
    };
  }, [phase, account]);

  const connect = useCallback(async () => {
    if (!request) return;
    setPhase("connecting");
    setError("");
    try {
      const { code } = await authService.authorizeDevice({
        codeChallenge: request.codeChallenge,
        attributionId: readAttributionId(),
      });

      // Re-validate immediately before navigating. The URL was checked on
      // mount, but this is the line that actually hands out a session, so it
      // does not trust a value that has been sitting in React state.
      const redirect = parseLoopbackRedirect(request.redirectUri);
      if (!redirect) {
        setPhase("invalid");
        return;
      }

      setPhase("done");
      window.location.replace(
        buildCallbackUrl(redirect, { code, state: request.state }),
      );
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || t("connect.failed"));
      setPhase("error");
    }
  }, [request, t]);

  if (phase === "checking") {
    return <LoadingScreen title={t("connect.title")} subtitle={t("auth.pleaseWait")} />;
  }

  if (phase === "done") {
    return <LoadingScreen title={t("connect.handingOver")} subtitle={t("connect.returnToApp")} />;
  }

  if (phase === "invalid") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("connect.invalidTitle")}
        </h1>
        <p className="text-sm text-muted">{t("connect.invalidBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("connect.title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{t("connect.subtitle")}</p>
      </div>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="rounded-md border border-border bg-field-background px-4 py-3">
        <div className="text-xs text-muted">{t("connect.accountLabel")}</div>
        <div className="mt-1 text-sm text-foreground">{account || "—"}</div>
      </div>

      <div className="space-y-3">
        <Button
          type="button"
          variant="primary"
          className="w-full"
          isDisabled={phase === "connecting"}
          onPress={connect}
        >
          {phase === "connecting" ? t("connect.connecting") : t("connect.confirm")}
        </Button>
        <p className="text-xs text-muted">{t("connect.note")}</p>
      </div>
    </div>
  );
}
