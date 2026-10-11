"use client";
import {
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { ChevronDown, Search, type LucideIcon } from "lucide-react";

// Fields are 36px; a textarea grows from the same padding.
export const inputClass =
  "min-h-9 w-full rounded-md border border-field-border bg-field-background px-3 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted hover:border-foreground/20 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:opacity-50";
export const textareaClass = `${inputClass} min-h-20 leading-6`;
export const selectClass =
  "w-full appearance-none rounded-md border border-field-border bg-field-background pl-3 pr-8 text-[13px] text-foreground outline-none transition-colors hover:border-foreground/20 focus-visible:border-foreground/40 focus-visible:ring-2 focus-visible:ring-foreground/10 disabled:opacity-50";

/**
 * A native <select> with our chevron instead of the browser's. Native on
 * purpose: the OS picker is the right control on a phone, and it is already
 * accessible. Drop-in for `<select className={inputClass}>`.
 */
export function Select({
  className = "",
  size = "md",
  wrapperClassName = "w-full",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "md" | "sm";
  /** Width of the control; full width unless given. */
  wrapperClassName?: string;
}) {
  return (
    <span className={`relative inline-flex ${wrapperClassName}`}>
      <select
        className={`${selectClass} ${size === "sm" ? "h-8" : "h-9"} ${className}`}
        {...props}
      />
      <ChevronDown
        size={14}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

/** Label above, help or error below. `aside` sits at the label's right end. */
export function Field({
  label,
  htmlFor,
  help,
  error,
  aside,
  className = "",
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  help?: ReactNode;
  error?: ReactNode;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </label>
        {aside && <span className="text-[13px]">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p className="text-xs leading-5 text-danger-ink">{error}</p>
      ) : (
        help && <p className="text-xs leading-5 text-muted">{help}</p>
      )}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  className = "sm:w-72",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  return (
    <label className={`relative block w-full ${className}`}>
      <span className="sr-only">{label}</span>
      <Search
        size={15}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
      />
      <input
        type="text"
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md bg-surface-secondary pl-8 pr-3 text-[13px] outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-foreground/15 sm:h-8"
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
      <ChevronDown size={12} strokeWidth={2} aria-hidden="true" className="text-muted" />
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

/**
 * The segmented track, for groups that must stay toggle buttons
 * (aria-pressed) rather than radios — e.g. where e2e drives them as buttons.
 */
export const trackClass = "inline-flex shrink-0 rounded-md bg-surface-secondary p-0.5";
export const segmentClass = (on: boolean, size: "sm" | "md" = "sm") =>
  `inline-flex items-center justify-center gap-1.5 rounded-[5px] px-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
    size === "sm" ? "h-7" : "h-8"
  } ${
    on
      ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
      : "text-muted hover:text-foreground"
  }`;

/**
 * One choice of a few (보기 방식, 필터, 테마): a radio group drawn as a
 * segmented track. Arrow keys move the choice, like native radios.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "sm",
  iconOnly = false,
}: {
  options: { value: T; label: string; icon?: LucideIcon }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, step: number) => {
    const next = (from + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  const onKey = (event: KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(index, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(index, -1);
    }
  };
  return (
    <div role="radiogroup" aria-label={label} className={trackClass}>
      {options.map(({ value: v, label: text, icon: Icon }, index) => {
        const on = v === value;
        return (
          <button
            key={v}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={iconOnly ? text : undefined}
            title={iconOnly ? text : undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(v)}
            onKeyDown={(event) => onKey(event, index)}
            className={`${segmentClass(on, size)} ${iconOnly ? "w-8 px-0" : ""}`}
          >
            {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden="true" />}
            {!iconOnly && text}
          </button>
        );
      })}
    </div>
  );
}

/** In-page tabs (state, not routes): "멤버 · 초대". Same track as Segmented. */
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
    <div role="tablist" aria-label={label} className={trackClass}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={segmentClass(value === t.value, "sm")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
