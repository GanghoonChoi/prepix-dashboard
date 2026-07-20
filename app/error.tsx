"use client";

import { useEffect } from "react";
import { Button } from "@heroui/react";
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
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t("misc.errorTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {t("misc.errorDescription")}
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="primary" size="sm" onPress={() => reset()}>
          {t("common.retry")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={() => (window.location.href = "/dashboard")}
        >
          {t("misc.goToDashboard")}
        </Button>
      </div>
    </div>
  );
}
