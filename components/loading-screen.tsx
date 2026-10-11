"use client";

import { useT } from "@/lib/i18n/context";

export function LoadingScreen({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const t = useT();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background">
      <span
        role="progressbar"
        aria-label={t("common.loading")}
        className="size-8 animate-spin rounded-full border-2 border-surface-tertiary border-t-foreground"
      />
      {title && (
        <div className="text-center">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
