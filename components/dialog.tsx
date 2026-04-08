"use client";

import type { UseOverlayStateReturn } from "@heroui/react";

export function Dialog({
  state,
  title,
  children,
}: {
  state: UseOverlayStateReturn;
  title: string;
  children: React.ReactNode;
}) {
  if (!state.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60" onClick={() => state.close()} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
