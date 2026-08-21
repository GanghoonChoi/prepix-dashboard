/**
 * The one-time code the marketing site hands us, and the two places it can
 * arrive from.
 *
 * IT USED TO BE A COOKIE ONLY. `Domain=.prepix.ai` is what made it readable
 * here, which worked for exactly as long as the dashboard answered to a
 * `prepix.ai` name. It now also answers to `dashboard.laskerstudio.com`, and a
 * cookie cannot cross two unrelated registrable domains — no amount of
 * configuration makes `.prepix.ai` reach `laskerstudio.com`. So the site
 * passes the hand-off in the URL as well, and this reads whichever showed up.
 *
 * IT IS THE FRAGMENT, NOT THE QUERY STRING, and that is the whole reason this
 * is acceptable. The objection to a URL parameter — written into this file
 * before it was one — was that it lands "in browser history and in the
 * `Referer` of every subsequent request". A fragment is never sent to a
 * server: not in the request line, not in `Referer`, so it appears in no
 * access log, no proxy, and no analytics property. What is left is the history
 * entry, and `clearHandoff` removes that before the redeem call returns.
 *
 * The cookie path stays, and is tried second. The desktop app and any site
 * build older than this one still use it, and a fallback that costs four lines
 * is cheaper than a deploy order that has to be right.
 */
const COOKIE = "px_handoff";

export interface Handoff {
  code: string;
  verifier: string;
}

function fromFragment(): Handoff | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const code = params.get("code");
  const verifier = params.get("verifier");
  return code && verifier ? { code, verifier } : null;
}

function fromCookie(): Handoff | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${COOKIE}=`));
  if (!hit) return null;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(hit.slice(COOKIE.length + 1)),
    ) as Partial<Handoff>;
    return typeof parsed.code === "string" && typeof parsed.verifier === "string"
      ? { code: parsed.code, verifier: parsed.verifier }
      : null;
  } catch {
    return null;
  }
}

export function readHandoff(): Handoff | null {
  return fromFragment() ?? fromCookie();
}

/**
 * Remove it from everywhere it could still be sitting.
 *
 * The fragment first, with `replaceState` rather than by assigning
 * `location.hash` — assigning adds a SECOND history entry holding the value we
 * are trying to erase, and leaves the original one behind. `replaceState`
 * rewrites the entry the visitor is standing on, so pressing Back afterwards
 * cannot land on a URL carrying the code.
 *
 * Then the cookie, on both scopes: the site sets it host-only in development
 * and on `.prepix.ai` in production, and this page cannot tell which it is
 * looking at. An unexpired credential left in the jar is the one outcome worth
 * ruling out, so clear both.
 */
export function clearHandoff(): void {
  if (typeof window !== "undefined" && window.location.hash) {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  if (typeof document === "undefined") return;
  const expire = "; path=/session; max-age=0";
  document.cookie = `${COOKIE}=${expire}`;
  document.cookie = `${COOKIE}=${expire}; domain=.prepix.ai`;
}
