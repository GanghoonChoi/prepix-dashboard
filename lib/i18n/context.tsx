"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { dictionaries } from "./translations";
import {
  DEFAULT_LANG,
  isLang,
  LANG_STORAGE_KEY,
  type Lang,
} from "./config";

type TFunc = (key: string, vars?: Record<string, string | number>) => string;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nValue | null>(null);

// Replace {name} placeholders. Missing vars are left as-is so a mistake shows up
// visibly rather than silently blanking.
function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * `?locale=` on the URL, when the visitor arrived from somewhere that already
 * knows their language.
 *
 * The marketing site is the reason this exists: a Korean reader who clicks
 * "로그인" on prepix.ai/ko should not land on an English form and have to find
 * the switcher. It ranks ABOVE the stored choice on purpose — the site knows
 * which language the person was just reading, and a stale localStorage value
 * from an old visit is the weaker signal. It is not persisted, so it steers
 * this arrival and does not overwrite a choice made here.
 */
function langFromUrl(): Lang | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("locale");
  return isLang(raw) ? raw : null;
}

// Resolve the initial language on the client. Order: ?locale= → explicit choice
// (localStorage) → cached profile.language → browser language → default (ko).
// Runs in an effect so the first paint is deterministic (DEFAULT_LANG) on both
// server and client — no hydration mismatch; a non-default user sees at most a
// brief switch after mount.
function resolveStoredLang(): Lang | null {
  const fromUrl = langFromUrl();
  if (fromUrl) return fromUrl;
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
    const info = JSON.parse(localStorage.getItem("userInfo") || "null");
    if (info && isLang(info.language)) return info.language;
  } catch {
    /* localStorage/JSON unavailable — fall through */
  }
  if (typeof navigator !== "undefined") {
    return navigator.language?.toLowerCase().startsWith("ko") ? "ko" : "en";
  }
  return null;
}

/**
 * The resolved language, outside React.
 *
 * `useI18n().lang` is the answer everywhere it can be used, but the redirects
 * that leave for the marketing site are built in effects that run BEFORE the
 * provider has resolved anything — React runs child effects first, so a
 * component that bounces on mount would read `DEFAULT_LANG` and send half our
 * visitors to the wrong form. This reads the same three signals directly,
 * synchronously, at the moment the URL is built.
 */
export function readLang(): Lang {
  return resolveStoredLang() ?? DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const resolved = resolveStoredLang();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resolved && resolved !== DEFAULT_LANG) setLangState(resolved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    // Best-effort persist to the account so the choice follows the user across
    // devices. Lazy import avoids a hard dependency cycle with the API client.
    void import("@/lib/api/services/user.service").then(({ userService }) =>
      userService.updateProfile({ language: next }).catch(() => {}),
    );
  }, []);

  const t = useCallback<TFunc>(
    (key, vars) => {
      const dict = dictionaries[lang] ?? dictionaries[DEFAULT_LANG];
      const value = dict[key] ?? dictionaries.en[key] ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  // Fail soft outside a provider (keys echo through) so a stray consumer never
  // crashes a render.
  if (!ctx) return { lang: DEFAULT_LANG, setLang: () => {}, t: (k) => k };
  return ctx;
}

export function useT(): TFunc {
  return useI18n().t;
}
