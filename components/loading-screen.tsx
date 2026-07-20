"use client";

import {
  ProgressCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
  ProgressCircleFillCircle,
} from "@heroui/react";
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
      <ProgressCircle aria-label={t("common.loading")} isIndeterminate size="lg">
        <ProgressCircleTrack>
          <ProgressCircleTrackCircle />
          <ProgressCircleFillCircle />
        </ProgressCircleTrack>
      </ProgressCircle>
      {title && (
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      )}
    </div>
  );
}
