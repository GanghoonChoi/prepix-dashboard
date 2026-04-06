"use client";

import {
  ProgressCircle,
  ProgressCircleTrack,
  ProgressCircleTrackCircle,
  ProgressCircleFillCircle,
} from "@heroui/react";

export function LoadingScreen({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6">
      <ProgressCircle aria-label="Loading" isIndeterminate size="lg">
        <ProgressCircleTrack>
          <ProgressCircleTrackCircle />
          <ProgressCircleFillCircle />
        </ProgressCircleTrack>
      </ProgressCircle>
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        {subtitle && (
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
