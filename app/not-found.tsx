"use client";

import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/context";

export default function NotFound() {
  const t = useT();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-7xl font-bold tracking-tight text-foreground">404</p>
        <h1 className="mt-4 text-base font-medium text-foreground">
          {t("misc.notFoundTitle")}
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {t("misc.notFoundDescription")}
        </p>
      </div>
      <Button onClick={() => (window.location.href = "/dashboard")}>
        {t("misc.backToDashboard")}
      </Button>
    </div>
  );
}
