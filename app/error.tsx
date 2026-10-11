"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/context";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    // Surface to the console; wire to a frontend error reporter (e.g. Sentry)
    // here when one is added.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <h1 className="text-base font-medium text-foreground">
          {t("misc.errorTitle")}
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {t("misc.errorDescription")}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          onClick={() => (window.location.href = "/dashboard")}
        >
          {t("misc.goToDashboard")}
        </Button>
        <Button onClick={() => reset()}>{t("common.retry")}</Button>
      </div>
    </div>
  );
}
