/**
 * The browser half of the desktop handoff.
 *
 * The desktop app opens this dashboard at `/connect` with a PKCE challenge and
 * a loopback `redirect_uri`. Once the visitor is signed in and has said yes,
 * we ask the backend for a one-time code and send the browser to that loopback
 * address, where the app's own server is listening.
 *
 * Everything here is about one question: is this redirect target something the
 * app on THIS machine opened, or something an attacker put in a link?
 */

/** Where the website drops the visitor's anonymous id. See `readAttributionId`. */
const ATTRIBUTION_COOKIE = "px_aid";

export interface ConnectRequest {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Accept a redirect target only if it is a loopback address on this machine.
 *
 * This is the single most important check in the flow. Without it, `/connect`
 * is an open redirect that hands a live authorization code to whatever host a
 * crafted link names — and the code is a session. RFC 8252 §7.3 names loopback
 * as the native-app redirect, and loopback is the only thing we accept:
 *
 *   - literal `127.0.0.1` or `[::1]` only. NOT `localhost`, which resolves
 *     through DNS and can be pointed elsewhere on a hostile network.
 *   - `http:` only, because a loopback listener has no certificate. This is
 *     the one place plaintext is correct rather than a compromise.
 *   - an explicit port, because the app binds an ephemeral one.
 *   - no credentials, no query, no fragment — we append our own, and a
 *     pre-existing `?code=` would let a caller shadow it.
 */
export function parseLoopbackRedirect(raw: string | null): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  if (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]" && url.hostname !== "::1") {
    return null;
  }
  if (!url.port) return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  return url;
}

/** base64url of a byte array, no padding — matches the backend's digest format. */
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** S256, for checking that a challenge is at least well-formed before we use it. */
export async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return base64url(new Uint8Array(digest));
}

export function isBase64Url(value: string, minLength = 43): boolean {
  return value.length >= minLength && /^[A-Za-z0-9_-]+$/.test(value);
}

/**
 * Read the anonymous id the marketing site left behind.
 *
 * The cookie is set on `.prepix.ai`, so it is visible here and on the website
 * without either one talking to the other. This is the ONLY thing that lets us
 * say "the person who clicked download is the person who now has an account" —
 * an installer cannot carry a payload, so the id has to ride the browser.
 *
 * Absent for anyone who reached the dashboard without visiting the site, and
 * for anyone whose browser blocks it. Both are normal; it is never required.
 */
export function readAttributionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));
  if (!hit) return undefined;
  const value = decodeURIComponent(hit.slice(ATTRIBUTION_COOKIE.length + 1));
  return isBase64Url(value, 8) && value.length <= 64 ? value : undefined;
}

/**
 * Build the URL to send the browser back to.
 *
 * `state` goes back untouched so the app can tell its own in-flight request
 * from a stray hit on its loopback port.
 */
export function buildCallbackUrl(
  redirect: URL,
  params: { code: string; state: string },
): string {
  const out = new URL(redirect.toString());
  out.searchParams.set("code", params.code);
  out.searchParams.set("state", params.state);
  return out.toString();
}

/** Read and validate everything the app put in the query string. */
export function readConnectRequest(search: string): ConnectRequest | null {
  const q = new URLSearchParams(search);
  const redirect = parseLoopbackRedirect(q.get("redirect_uri"));
  const state = q.get("state") ?? "";
  const codeChallenge = q.get("code_challenge") ?? "";
  const method = q.get("code_challenge_method") ?? "";

  if (!redirect) return null;
  if (method !== "S256") return null;
  if (!isBase64Url(state, 8) || state.length > 128) return null;
  if (!isBase64Url(codeChallenge) || codeChallenge.length > 128) return null;

  return { redirectUri: redirect.toString(), state, codeChallenge };
}
