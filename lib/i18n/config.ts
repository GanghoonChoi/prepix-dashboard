// Dashboard i18n config. The dashboard is bilingual (Korean / English) with the
// choice persisted to localStorage and, best-effort, to the user's backend
// `language` field. Korean is the launch default.

export type Lang = "en" | "ko";

export const LANGS: readonly Lang[] = ["ko", "en"] as const;
export const DEFAULT_LANG: Lang = "ko";
export const LANG_STORAGE_KEY = "lang";

export const LANG_LABELS: Record<Lang, string> = {
  ko: "한국어",
  en: "English",
};

export function isLang(v: unknown): v is Lang {
  return v === "en" || v === "ko";
}

// Canonical legal/download pages live on the marketing homepage (single source
// of truth — the dashboard links out rather than duplicating legal text). The
// Korean site is under /ko/*; the English site has no lang prefix.
export const HOMEPAGE = "https://prepix.ai";

export type LegalPage = "terms-of-service" | "privacy-policy" | "refund-policy";

export function legalUrl(lang: Lang, page: LegalPage): string {
  return lang === "ko"
    ? `${HOMEPAGE}/ko/legal/${page}`
    : `${HOMEPAGE}/legal/${page}`;
}

export function downloadUrl(lang: Lang): string {
  return lang === "ko" ? `${HOMEPAGE}/ko/download` : `${HOMEPAGE}/download`;
}
