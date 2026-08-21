/**
 * Where to send someone after they finish signing in or signing up.
 *
 * Two shapes are allowed and nothing else:
 *
 *   - an internal path (`/dashboard`, `/plan`) — the ordinary case
 *   - an absolute URL on prepix.ai — because onboarding now STARTS on the
 *     marketing site. Someone who began at `prepix.ai/start` should land back
 *     there with their account made, not be dropped into a dashboard they did
 *     not ask for, halfway through a checklist they were following.
 *
 * That second case is why this file exists rather than a one-line
 * `startsWith("/")`. A post-auth redirect that accepts arbitrary absolute URLs
 * is a credential-phishing primitive: an attacker mails
 * `?returnTo=https://prepix-ai.example/login`, the victim authenticates on the
 * real site, gets bounced to a convincing copy, and types the password again.
 * So the host is checked against a fixed list, not a pattern — `endsWith`
 * would happily accept `evil-prepix.ai`.
 */

/** Hosts we will hand a freshly authenticated visitor to. */
const ALLOWED_HOSTS = new Set([
  "prepix.ai",
  "www.prepix.ai",
  "dashboard.prepix.ai",
]);

const DEFAULT = "/dashboard";

export function safeReturnTo(
  raw: string | null | undefined,
  fallback: string = DEFAULT,
): string {
  if (!raw) return fallback;

  // Internal path. `//evil.com` is protocol-relative and would leave the site,
  // so a leading slash alone is not enough.
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  try {
    const url = new URL(raw);
    // Localhost over http is allowed in development only, so the site running
    // on :3001 can be tested end to end without weakening the shipped rule.
    const isLocalDev =
      process.env.NODE_ENV !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (isLocalDev) return url.toString();

    if (url.protocol !== "https:") return fallback;
    if (!ALLOWED_HOSTS.has(url.hostname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

/** Read `?returnTo=` off the current URL. Safe to call on the server (returns the fallback). */
export function readReturnTo(fallback: string = DEFAULT): string {
  if (typeof window === "undefined") return fallback;
  return safeReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
    fallback,
  );
}

/**
 * `?email=` — what the marketing site already asked for, so nobody types their
 * address twice. Validated loosely on purpose: the field is a convenience and
 * the real check is the backend's, but a value that is not plausibly an email
 * should not be pushed into the form at all.
 */
export function readPrefilledEmail(): string {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("email") ?? "";
  const value = raw.trim();
  if (value.length > 254) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}
