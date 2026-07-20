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

// Resolve the initial language on the client. Order: explicit choice
// (localStorage) → cached profile.language → browser language → default (ko).
// Runs in an effect so the first paint is deterministic (DEFAULT_LANG) on both
// server and client — no hydration mismatch; a non-default user sees at most a
// brief switch after mount.
function resolveStoredLang(): Lang | null {
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
