import type { NextConfig } from "next";

// Baseline security headers. We deliberately skip a strict Content-Security-Policy
// because the app loads third-party scripts (Google Identity Services, Paddle.js)
// that a tight CSP would break without careful per-domain allowlisting.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/**
 * The sign-in form lives on the marketing site now.
 *
 * `prepix.ai/login` and `/signup` are real pages in the site's design system,
 * and this app takes the session they produce at `/session` (see that page for
 * the mechanism). Keeping a second copy of the form here is what "three
 * sign-up screens" looked like the first time, so these routes redirect
 * instead.
 *
 * `/forgot-password` and `/reset-password` deliberately DO NOT move. Password
 * reset starts from a link the backend emails, and that link has to land where
 * the session will be.
 *
 * Temporary (307) rather than permanent: a 308 is cached by the browser more
 * or less forever, and the desktop app in the field still opens `/login` on
 * older builds. Promote it once those have rolled over.
 */
const SITE = "https://prepix.ai";

/**
 * OFF by default, and that is deliberate.
 *
 * `prepix.ai` is currently served by the OLD marketing app, which has no
 * `/login`. Turning this on before the renewed site is live sends people to a
 * 404 — and worse, the old site's own `/ko/login` redirect points here, so the
 * two would hand each other a visitor who ends up nowhere.
 *
 * Set `NEXT_PUBLIC_AUTH_ON_SITE=1` in the dashboard's environment the moment
 * `prepix.ai/login` answers, and not before. Until then this app keeps serving
 * its own forms, which still work.
 */
const AUTH_ON_SITE = process.env.NEXT_PUBLIC_AUTH_ON_SITE === "1";

const nextConfig: NextConfig = {
  async redirects() {
    if (!AUTH_ON_SITE) return [];
    /*
     * `missing` is the door back in for Google.
     *
     * The site's form cannot offer Google sign-in — its CSP does not admit
     * Google Identity Services and should not, since that script would then
     * run on every page carrying the form. So the site LINKS here for it, and
     * without an exception that link would be redirected straight back to the
     * page it came from, leaving Google users with no way in at all.
     *
     * `method=google` is that exception: the one shape of this URL that still
     * renders our own form (Google button included). A redirect rule applies
     * only when its `missing` condition does NOT match, so every other
     * `/login` still goes to the site.
     */
    const exceptGoogle = [
      { type: "query" as const, key: "method", value: "google" },
    ];
    /*
     * `?locale=ko` decides WHICH form, and it has to.
     *
     * The site keys language off the path — `/login` is English, `/ko/login` is
     * Korean — so a redirect that ignores the parameter sends every Korean
     * visitor to an English form. That is not hypothetical: the desktop app's
     * `/connect` bounces here when there is no session, and everyone arriving
     * that way is bounced onward. `lib/auth-entry.ts` is what puts the
     * parameter on; these two rules are the half that reads it.
     *
     * Korean first — rules are matched in order and the plain ones below would
     * otherwise swallow every request. Anything that is not `ko` (including no
     * parameter at all) falls through to English, which is the site's own
     * default path.
     *
     * `returnTo` needs no mention anywhere here: Next passes the remaining
     * query through untouched as long as the destination carries none itself.
     */
    const korean = [{ type: "query" as const, key: "locale", value: "ko" }];
    return [
      {
        source: "/login",
        has: korean,
        missing: exceptGoogle,
        destination: `${SITE}/ko/login`,
        permanent: false,
      },
      {
        source: "/signup",
        has: korean,
        missing: exceptGoogle,
        destination: `${SITE}/ko/signup`,
        permanent: false,
      },
      {
        source: "/login",
        missing: exceptGoogle,
        destination: `${SITE}/login`,
        permanent: false,
      },
      {
        source: "/signup",
        missing: exceptGoogle,
        destination: `${SITE}/signup`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      { source: '/connect', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/start', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      { source: '/dashboard/invitations/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
      // Carries a verification token in its URL — in a QUERY string, which is
      // exactly where no-referrer matters most.
      { source: '/verify-email', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
};

export default nextConfig;
