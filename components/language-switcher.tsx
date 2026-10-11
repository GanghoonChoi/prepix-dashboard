"use client";

import { useI18n } from "@/lib/i18n/context";
import { LANGS, LANG_LABELS } from "@/lib/i18n/config";

// Segmented KO/EN toggle. Persists via the i18n context (localStorage + the
// user's backend `language` field).
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={`inline-flex rounded-md bg-surface-secondary p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`h-6 rounded-[5px] px-2.5 text-xs font-medium transition-colors ${
            lang === l
              ? "bg-background text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              : "text-muted hover:text-foreground"
          }`}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
