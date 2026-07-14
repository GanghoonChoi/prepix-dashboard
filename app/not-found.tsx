"use client";

import { Button } from "@heroui/react";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-muted">
          404
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onPress={() => (window.location.href = "/dashboard")}
      >
        Back to dashboard
      </Button>
    </div>
  );
}
