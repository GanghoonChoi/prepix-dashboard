import posthog from "posthog-js";
import { readAttributionId } from "@/lib/device-connect";

/*
  Every click and every page of the dashboard, in the same PostHog project as
  prepix.ai, the desktop app and the backend (2026-11-09: the company wants
  the whole journey on record for managing its own user data).

  WHO an event belongs to:
    signed out  the website's `px_aid` cookie, so the sign-up and log-in pages
                continue the same person who was just on prepix.ai
    signed in   the account id, the one the backend's `user_signed_up` and the
                desktop app already use

  The two are never merged. A switch resets PostHog first, so `identify` only
  ever folds in an empty anonymous id. The account reaches its web visits
  through `web_attribution_id`, the property the backend sets at sign-up;
  that was a decision on the site side (nothing irreversible, and a shared
  browser cannot fold one person's visits into another's account) and this
  keeps to it.
*/

// Public by design: a project key identifies, it does not authorise.
const POSTHOG_TOKEN = "phc_x6IEHUGQNzWMQa8atVSZomfBjwWCIqYLD24kTMUjq9U";
// The `/relay` rewrite in next.config.ts: ad blockers block posthog.com by name.
const POSTHOG_RELAY = "/relay";

let started = false;

function signedInAccount(): string | null {
  try {
    const id = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

export type IdentityAction = "none" | "identify" | "reset";

/** What to do so the next event belongs to the right person. */
export function identityAction(
  account: string | null,
  current: string | undefined,
  identified: boolean,
): IdentityAction {
  if (account) return current === account ? "none" : "identify";
  return identified ? "reset" : "none";
}

export function startAnalytics(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Bootstrapping `px_aid` for a signed-in reader would overwrite the account
  // id on every load, so it is only offered while signed out.
  const visitor = signedInAccount() ? undefined : readAttributionId();

  posthog.init(POSTHOG_TOKEN, {
    api_host: POSTHOG_RELAY,
    ui_host: "https://us.posthog.com",
    ...(visitor ? { bootstrap: { distinctID: visitor } } : {}),
    /*
      localStorage only. The site keeps its PostHog state in a cookie on
      `.prepix.ai` under the same project key, so a cookie here would be
      shared with it and the two apps would keep overwriting each other's id.
    */
    persistence: "localStorage",
    person_profiles: "always",
    // Sent by `trackPage` after the identity is settled, so a page view right
    // after sign-in is not filed under the visitor it just stopped being.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    capture_heatmaps: true,
    capture_dead_clicks: true,
    disable_session_recording: false,
    // Every input is masked: passwords, emails and card fields stay in the browser.
    session_recording: { maskAllInputs: true },
    disable_surveys: true,
    capture_performance: false,
    advanced_disable_feature_flags: true,
  });
}

/** Called on every route change: settle who this is, then count the page. */
export function trackPage(): void {
  if (!started) return;
  const account = signedInAccount();
  const action = identityAction(
    account,
    posthog.get_distinct_id(),
    posthog.get_property("$user_state") === "identified",
  );
  if (action !== "none") posthog.reset();
  if (action === "identify" && account) posthog.identify(account);
  posthog.capture("$pageview");
}
