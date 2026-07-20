"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n/context";
import { legalUrl, type LegalPage } from "@/lib/i18n/config";

// The marketing homepage is the single source of truth for legal text. The
// dashboard's /terms, /privacy and /refund-policy routes redirect there, in the
// viewer's current language, rather than duplicating the documents.
export function LegalRedirect({ page }: { page: LegalPage }) {
  const { lang } = useI18n();

  useEffect(() => {
    window.location.replace(legalUrl(lang, page));
  }, [lang, page]);

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-muted">
      <a
        href={legalUrl(lang, page)}
        className="underline underline-offset-4 hover:text-foreground"
      >
        {lang === "ko" ? "이동 중… 눌러서 계속" : "Redirecting… tap to continue"}
      </a>
    </div>
  );
}
