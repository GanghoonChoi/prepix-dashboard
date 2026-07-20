"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { legalUrl } from "@/lib/i18n/config";

// Left branding panel on the auth pages. Client component so its copy is
// localized and its policy links point at the homepage in the current language.
export function AuthBrandPanel() {
  const { t, lang } = useI18n();
  return (
    <div className="hidden w-[480px] shrink-0 flex-col justify-between border-r border-border bg-surface p-10 lg:flex">
      <div>
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/prepix-symbol.svg" alt="Prepix" width={24} height={24} />
          <Image src="/prepix-wordmark.svg" alt="Prepix" width={80} height={20} />
        </Link>
      </div>

      <div className="space-y-6">
        <blockquote className="text-lg font-medium leading-relaxed text-foreground">
          &quot;{t("auth.testimonialQuote")}&quot;
        </blockquote>
        <div>
          <p className="text-sm font-medium text-foreground">{t("auth.testimonialTeam")}</p>
          <p className="text-xs text-muted">{t("auth.testimonialRole")}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex gap-4 text-xs text-muted">
          <a href={legalUrl(lang, "terms-of-service")} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">{t("auth.terms")}</a>
          <a href={legalUrl(lang, "privacy-policy")} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">{t("auth.privacy")}</a>
          <a href={legalUrl(lang, "refund-policy")} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">{t("auth.refundPolicy")}</a>
        </div>
        <p className="text-xs text-muted">
          {t("auth.copyright", { year: new Date().getFullYear() })}
        </p>
      </div>
    </div>
  );
}
