"use client";
import { useEffect, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The few pieces every page is built from (docs/design/2026-10-07-dashboard-
 * redesign.md). The page owns its content; these own the measure, the type
 * scale and the hairlines, so two pages cannot drift into two styles again.
 */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-balance text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-pretty text-[13px] leading-5 text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

/** Sibling pages of one topic, e.g. 플랜 · 사용량. Exact-match on the path. */
export function PageTabs({
  tabs,
}: {
  tabs: { href: string; label: string }[];
}) {
  const path = usePathname();
  return (
    <nav className="-mt-2 mb-6 flex gap-5 border-b border-border text-[13px]">
      {tabs.map((tab) => {
        // The first tab is the topic's own page; the others also stay lit on
        // their children (a statement month, a request).
        const active =
          path === tab.href ||
          (tab.href !== tabs[0].href && path.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2.5 transition-colors ${
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export const cardClass = "rounded-lg border border-border bg-background";

export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${cardClass} p-5 ${className}`}>{children}</section>
  );
}

/** A labelled figure. `children` goes under the value (a bar, a footnote). */
export function Stat({
  label,
  value,
  unit,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={className}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && (
          <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
        )}
      </p>
      {children && <div className="mt-3 text-xs text-muted">{children}</div>}
    </Card>
  );
}

/** Thin progress bar, 0–100. */
export function Meter({ value }: { value: number }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-surface-tertiary">
      <div
        className="h-full rounded-full bg-foreground transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Close a popover on a click outside `ref` or on Escape. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, close]);
}

export const menuClass =
  "z-30 overflow-hidden rounded-lg border border-border bg-overlay p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)]";
export const menuItemClass =
  "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary";
