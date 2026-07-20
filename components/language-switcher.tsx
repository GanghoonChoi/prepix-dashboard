"use client";

import { useI18n } from "@/lib/i18n/context";
import { LANGS, LANG_LABELS } from "@/lib/i18n/config";

// Segmented KO/EN toggle. Persists via the i18n context (localStorage + the
// user's backend `language` field).
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div
      className={`inline-flex rounded-md border border-border p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            lang === l
              ? "bg-foreground text-background"
              : "text-muted hover:text-foreground"
          }`}
        >
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
