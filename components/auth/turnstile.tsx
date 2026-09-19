"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile, on the two calls that make the backend send mail:
 * registration and the password-reset request.
 *
 * A copy of the same component on laskerstudio.com. The two live in different
 * repositories and share no package, and a widget that is one script tag and
 * three calls is not worth a publish pipeline to deduplicate — but they must
 * stay in step, because the backend guards ONE endpoint that both origins post
 * to.
 *
 * NO SITE KEY = NO WIDGET, matching the backend, where an unset secret turns
 * the guard off. That is what lets the backend, this app and the marketing
 * site be configured in any order without a window where signup is closed.
 *
 * Tokens are single-use, so the caller bumps `resetKey` after a failed submit.
 */
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      theme?: "auto" | "light" | "dark";
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Shared across mounts — the script may only be added once per page. */
let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Turnstile script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function Turnstile({
  onToken,
  resetKey = 0,
}: {
  /** Called with the token, or `null` when it expires or errors. */
  onToken: (token: string | null) => void;
  /** Change this to discard the current token and challenge again. */
  resetKey?: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  /*
   * The parent passes an inline arrow, so it is a new function each render.
   * A ref keeps it out of the mount effect's deps — otherwise every keystroke
   * in the email field would tear down the widget and discard a solved
   * challenge.
   */
  const latestOnToken = useRef(onToken);
  latestOnToken.current = onToken;

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !host.current) return;
    let cancelled = false;
    const element = host.current;

    loadTurnstile()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetId.current = window.turnstile.render(element, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => latestOnToken.current(token),
          "expired-callback": () => latestOnToken.current(null),
          "error-callback": () => latestOnToken.current(null),
          theme: "auto",
        });
      })
      .catch(() => {
        if (!cancelled) {
          // Cloudflare unreachable. The backend fails open for the same
          // outage, so let the submit through rather than alarming anyone.
          setFailed(true);
          latestOnToken.current(null);
        }
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    // Skips the first render: there is no spent token to replace yet.
    if (resetKey === 0 || !widgetId.current || !window.turnstile) return;
    window.turnstile.reset(widgetId.current);
    latestOnToken.current(null);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY || failed) return null;
  return <div ref={host} className="flex justify-center" />;
}
