import { readLang } from "@/lib/i18n/context";
import type { Lang } from "@/lib/i18n/config";

/**
 * Every link in this app that leads to a sign-in or a sign-up screen.
 *
 * They are still our own paths — `/login` and `/signup` — because that is what
 * they are while `NEXT_PUBLIC_AUTH_ON_SITE` is off. Once it is on, both are
 * redirected to `prepix.ai`, and THAT is why these carry `?locale=`.
 *
 * The redirect happens in `next.config.ts`, server-side, with nothing to read
 * but the URL: no localStorage, no cookie, no `Accept-Language` worth trusting
 * for a person who has already told us their language. The site keys language
 * off the PATH (`/login` vs `/ko/login`), so the parameter is the only thing
 * that can decide which of the two a visitor lands on. Without it every
 * Korean-speaking visitor bounced out of the desktop hand-off arrives at an
 * English form and has to find their way back.
 *
 * `locale` also survives the trip as a plain query parameter, which is what
 * the site's own `?locale=` readers and this app's `langFromUrl` expect on the
 * way back. It is a hint about language and nothing else — never an
 * authorisation, never a redirect target.
 */

type Options = {
  /** Where to land once the session exists. Internal paths only here. */
  returnTo?: string;
  /**
   * The language, when the caller already has it from `useI18n()`.
   *
   * Omit it inside an effect that runs on mount: the provider has not resolved
   * yet at that point and the hook would answer with the default. `readLang()`
   * asks the same questions without waiting.
   */
  lang?: Lang;
};

function entry(path: "/login" | "/signup", options: Options = {}): string {
  const lang = options.lang ?? readLang();
  const params = new URLSearchParams({ locale: lang });
  if (options.returnTo) {
    params.set("returnTo", options.returnTo);
  }
  return `${path}?${params.toString()}`;
}

export const loginHref = (options?: Options) => entry("/login", options);
export const signupHref = (options?: Options) => entry("/signup", options);
