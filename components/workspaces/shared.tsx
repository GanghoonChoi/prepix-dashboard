"use client";
import { WorkspaceNav } from "./workspace-context";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";

export const inputClass =
  "w-full rounded-md border border-border bg-field-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40";
export const primaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-85 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
export const secondaryClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
export function TeamShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl space-y-8 text-foreground">
      <Link
        href="/dashboard/workspaces"
        className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline"
      >
        {t("team.title")}
      </Link>
      <header>
        <p className="mb-3 text-xs font-medium text-muted">
          {t("team.preview")}
        </p>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-3 max-w-2xl text-pretty text-sm leading-6 text-muted">
            {description}
          </p>
        )}
      </header>
      <WorkspaceNav />
      {children}
    </div>
  );
}
export function TeamError({
  code,
  retry,
}: {
  code: string;
  retry?: () => void;
}) {
  const { t } = useI18n();
  const key = `team.error.${code}`;
  const message = t(key);
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{message === key ? t("team.error.REQUEST_FAILED") : message}</p>
      {retry && (
        <button className={`${secondaryClass} mt-3`} onClick={retry}>
          {t("team.retry")}
        </button>
      )}
    </div>
  );
}
export function TeamLoading() {
  const { t } = useI18n();
  return (
    <p role="status" className="py-8 text-sm text-muted">
      {t("team.loading")}
    </p>
  );
}
