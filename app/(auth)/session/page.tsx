"use client";

import { useEffect, useState } from "react";
import { LoadingScreen } from "@/components/loading-screen";
import { apiClient } from "@/lib/api/client";
import { readHandoff, clearHandoff } from "@/lib/handoff";
import { safeReturnTo } from "@/lib/return-to";
import { markSignedIn } from "@/lib/account-hint";
import { loginHref } from "@/lib/auth-entry";
import { useI18n } from "@/lib/i18n/context";

/**
 * Take the session the marketing site just created.
 *
 * Signing in happens on the marketing site now. A browser session belongs to its
 * origin, so it cannot simply be shared — this page is where it becomes ours.
 *
 * WHAT ARRIVES IS A ONE-TIME CODE, NOT THE SESSION. The site mints it from
 * its own freshly-obtained tokens and hands it over in the URL FRAGMENT — or,
 * from older builds and the desktop app, in a cookie. We redeem it here for
 * tokens of our own, then erase whichever carried it (`clearHandoff`, which
 * rewrites the history entry so Back cannot reach the code either).
 *
 * Copying the real tokens across instead would put a 30-day refresh token in a
 * URL or a shared cookie, where it outlives the navigation in history and in
 * access logs. A two-minute single-use code does not. This is the same
 * `/auth/device/*` exchange the desktop app uses.
 *
 * The fragment is what lets this page serve `dashboard.laskerstudio.com` as
 * well as `dashboard.prepix.ai`: a cookie cannot cross two unrelated domains,
 * and a fragment is never sent to a server at all. See `lib/handoff.ts`.
 *
 * There is nothing to see here — it is one request and a redirect — so the
 * page is a spinner and an error state, nothing more.
 */
export default function SessionPage() {
  const { t, lang } = useI18n();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const handoff = readHandoff();
    clearHandoff();

    // Nothing in the fragment and nothing in the jar: someone opened this URL
    // directly, or it expired, or their browser refused the cookie. Not an
    // error worth explaining — send them to the form, which is the only
    // useful thing left to do.
    if (!handoff) {
      window.location.replace(loginHref());
      return;
    }

    apiClient
      .post("/auth/device/token", {
        code: handoff.code,
        codeVerifier: handoff.verifier,
      })
      .then(({ data }) => {
        const session = data.data;
        localStorage.setItem("accessToken", session.accessToken);
        localStorage.setItem("refreshToken", session.refreshToken);
        if (session.user) {
          localStorage.setItem("userInfo", JSON.stringify(session.user));
        }
        // So prepix.ai's header can offer "dashboard" instead of "sign in".
        markSignedIn();
        const back = safeReturnTo(
          new URLSearchParams(window.location.search).get("returnTo"),
        );
        if (back.startsWith("/")) {
          window.location.replace(back);
        } else {
          window.location.assign(back);
        }
      })
      .catch(() => {
        // A code is single-use and lives two minutes. The realistic causes are
        // a stale back-button and a slow hop, and for both the right move is
        // to offer the form again rather than to explain the mechanism.
        setFailed(true);
      });
  }, []);

  if (failed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("session.failedTitle")}
        </h1>
        <p className="text-sm text-muted">{t("session.failedBody")}</p>
        <a
          href={loginHref({ lang })}
          className="text-foreground underline underline-offset-4 hover:no-underline"
        >
          {t("auth.signIn")}
        </a>
      </div>
    );
  }

  return <LoadingScreen title={t("session.title")} subtitle={t("auth.pleaseWait")} />;
}
