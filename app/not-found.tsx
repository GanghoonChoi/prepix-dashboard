"use client";

import { Button } from "@heroui/react";
import { useT } from "@/lib/i18n/context";

export default function NotFound() {
  const t = useT();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-muted">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {t("misc.notFoundTitle")}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          {t("misc.notFoundDescription")}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onPress={() => (window.location.href = "/dashboard")}
      >
        {t("misc.backToDashboard")}
      </Button>
    </div>
  );
}
