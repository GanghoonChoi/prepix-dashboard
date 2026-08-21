/**
 * Telling `prepix.ai` that this browser has an account.
 *
 * The marketing site cannot see a session here — tokens live in this origin's
 * localStorage and a browser session belongs to its origin. Left at that, its
 * header offers "sign in" to someone who has been signed in for a month, and
 * clicking it walks them into an empty form. It cannot even be fixed by
 * sending them here first: with `NEXT_PUBLIC_AUTH_ON_SITE=1` our own `/login`
 * redirects to the site server-side, so the "already signed in, skip the form"
 * check on that page never runs.
 *
 * So we leave a hint the site can read: `px_signed_in=1` on `.prepix.ai`.
 *
 * IT IS NOT A CREDENTIAL AND CANNOT BECOME ONE. It carries one character, it
 * is deliberately readable by script (the site reads it with `document.cookie`
 * — `HttpOnly` would defeat the entire purpose), and forging it buys nothing
 * but a link to a page that still asks for a password. Nothing here or on the
 * site may ever treat it as proof of anything.
 *
 * Being wrong is expected and harmless: an expired session leaves it behind,
 * the site says "dashboard", and we bounce them to the form — which is where
 * the honest answer would have sent them one hop earlier.
 *
 * The reader is `laskerstudio.com/apps/site/lib/account.ts`. The two files
 * share a cookie name and nothing else; keep them named after each other.
 */

const COOKIE = "px_signed_in";

/** A month, matching the refresh token's own life. */
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * `.prepix.ai` in production, host-only anywhere else.
 *
 * A preview deployment or a laptop has no shared parent to scope to, and
 * setting one there makes the browser drop the cookie silently.
 */
function domainAttribute(): string {
  const { hostname } = window.location;
  return hostname === "prepix.ai" || hostname.endsWith(".prepix.ai")
    ? "; domain=.prepix.ai"
    : "";
}

/** Call wherever a session is created — every path that writes a token. */
export function markSignedIn(): void {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE}=1; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}${domainAttribute()}`;
  } catch {
    /* the site simply keeps saying "sign in", which is never wrong, only slow */
  }
}

/**
 * Call wherever a session ends.
 *
 * Both scopes, because this runs on hosts that set it host-only and on hosts
 * that set it on `.prepix.ai`, and a stale hint is the one outcome worth
 * ruling out — the reader cannot tell which of the two it is looking at.
 */
export function clearSignedIn(): void {
  if (typeof document === "undefined") return;
  try {
    const expire = "; path=/; max-age=0";
    document.cookie = `${COOKIE}=${expire}`;
    document.cookie = `${COOKIE}=${expire}; domain=.prepix.ai`;
  } catch {
    /* nothing to do — see above */
  }
}
