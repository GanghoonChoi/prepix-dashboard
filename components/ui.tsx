"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
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

/* ---- People-table kit (Figma "People" pattern) ------------------------- */

const AVATAR_TONES = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-emerald-500",
];
/** A person's initial on a colour that stays the same for them everywhere. */
export function Avatar({
  id,
  name,
  size = 32,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`grid shrink-0 place-items-center rounded-full font-medium text-white ${AVATAR_TONES[hash % AVATAR_TONES.length]}`}
    >
      {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Small grey tag beside a name: 관리자, 외부, 참여 정지 … */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "danger";
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-px text-[11px] font-medium ${
        tone === "danger"
          ? "bg-red-500/10 text-red-600 dark:text-red-400"
          : "bg-surface-tertiary text-foreground/80"
      }`}
    >
      {children}
    </span>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative block w-full sm:w-80">
      <span className="sr-only">{label}</span>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 fill-none stroke-current text-muted"
        strokeWidth={1.75}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="text"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md bg-surface-secondary pl-8 pr-3 text-[13px] outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-foreground/15"
      />
    </label>
  );
}

/** "역할: 전체 ▾" — a native select dressed as a filter chip. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label className="relative inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-surface-secondary">
      <span className="text-muted">{label}:</span>
      <span className="font-medium">{current}</span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3 fill-none stroke-current text-muted" strokeWidth={2}>
        <path d="m6 9 6 6 6-6" />
      </svg>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** In-page tabs (state, not routes): "멤버 · 초대". */
export function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className="h-8 rounded-md px-3 text-[13px] text-muted transition-colors hover:text-foreground aria-selected:bg-surface-secondary aria-selected:font-medium aria-selected:text-foreground"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const tableClass = "w-full border-collapse text-left text-[13px]";
export const thClass =
  "h-11 border-b border-border px-3 text-xs font-medium text-muted first:pl-0 last:pr-0";
export const tdClass = "border-b border-border px-3 py-3 align-middle first:pl-0 last:pr-0";
export const rowClass =
  "cursor-pointer transition-colors hover:bg-surface focus-within:bg-surface";

/** Right-hand detail panel: a native modal dialog, so focus, Escape and the
 * backdrop behave without help. Mounted only while open. */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-dvh w-full max-w-md overflow-y-auto border-l border-border bg-background p-0 text-foreground shadow-[0_0_40px_rgba(0,0,0,0.25)] backdrop:bg-black/40"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
        <p className="truncate text-sm font-medium">{title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth={1.75}>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </dialog>
  );
}

/** "2시간 전" / "3 months ago" from an ISO instant; "—" when never. */
export function ago(iso: string | null | undefined, lang: string) {
  if (!iso) return "—";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { numeric: "auto" });
  if (minutes < 1) return lang === "ko" ? "방금 전" : "just now";
  if (minutes < 60) return rtf.format(-minutes, "minute");
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), "hour");
  if (minutes < 43200) return rtf.format(-Math.round(minutes / 1440), "day");
  if (minutes < 525600) return rtf.format(-Math.round(minutes / 43200), "month");
  return rtf.format(-Math.round(minutes / 525600), "year");
}
