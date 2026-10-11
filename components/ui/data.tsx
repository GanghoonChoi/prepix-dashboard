import type { ReactNode } from "react";
import { cardClass } from "./card";
import type { Tone } from "./badge";

type StatItem = { label: string; value: ReactNode; unit?: string; foot?: ReactNode };

/**
 * A row of figures in ONE card, split by hairlines — not a card per number.
 * Separate cards made three numbers look like three unrelated objects; one
 * strip reads as "the state of this thing". Stacks below `sm`.
 */
export function StatStrip({ items, className = "" }: { items: StatItem[]; className?: string }) {
  return (
    <dl
      className={`${cardClass} flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0 ${className}`}
    >
      {items.map((item, i) => (
        <div key={i} className="min-w-0 flex-1 p-5">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {item.value}
            {item.unit && <span className="ml-1 text-sm font-normal text-muted">{item.unit}</span>}
          </dd>
          {item.foot && <dd className="mt-3 text-xs text-muted">{item.foot}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** A single labelled figure — the old API; `children` goes under the value. */
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
  return <StatStrip className={className} items={[{ label, value, unit, foot: children }]} />;
}

/**
 * Thin progress bar, 0–100. `auto` turns amber from 90%, where a USED-up limit
 * starts to bite; a bar of what is LEFT should pass `neutral`, or a fresh
 * account would start out amber.
 */
export function Meter({
  value,
  tone = "auto",
  label,
}: {
  value: number;
  tone?: "auto" | "neutral";
  /**
   * Makes the bar a named progressbar. Without it the bar is decoration, for
   * callers that wrap it in their own progressbar (bytes, not percent).
   */
  label?: string;
}) {
  const percent = Math.max(0, Math.min(100, value));
  const warn = tone === "auto" && percent >= 90;
  const progress = label
    ? { role: "progressbar", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(percent) }
    : { "aria-hidden": true as const };
  return (
    <div {...progress} className="h-1.5 overflow-hidden rounded-full bg-surface-tertiary">
      <div
        className={`h-full rounded-full transition-[width] ${warn ? "bg-warning" : "bg-foreground"}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function MeterRow({
  label,
  value,
  percent,
  foot,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  percent: number;
  foot?: ReactNode;
  tone?: "auto" | "neutral";
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4 text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <Meter value={percent} tone={tone} label={typeof label === "string" ? label : undefined} />
      {foot && <p className="text-xs text-muted">{foot}</p>}
    </div>
  );
}

/** Label/value pairs: a fixed muted label column, the value beside it. */
export function PropertyList({
  items,
  divided = false,
}: {
  items: [ReactNode, ReactNode][];
  divided?: boolean;
}) {
  return (
    <dl className={`text-[13px] ${divided ? "" : "space-y-2"}`}>
      {items.map(([label, value], i) => (
        <div
          key={i}
          className={`grid gap-x-6 gap-y-0.5 sm:grid-cols-[8.75rem_1fr] ${
            divided ? "border-b border-border py-2.5 last:border-b-0" : ""
          }`}
        >
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A breakdown that adds up: line items, a rule, the total. */
export function SummaryRows({
  rows,
  total,
}: {
  rows: [ReactNode, ReactNode][];
  total?: [ReactNode, ReactNode];
}) {
  return (
    <dl className="space-y-2 text-[13px]">
      {rows.map(([label, value], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
      {total && (
        <div className="!mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-3">
          <dt className="text-sm font-medium">{total[0]}</dt>
          <dd className="text-right text-base font-semibold tabular-nums">{total[1]}</dd>
        </div>
      )}
    </dl>
  );
}

const dotTone: Record<Tone, string> = {
  neutral: "bg-muted",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** What happened, in order: a rail of dots with a title, a time, a detail. */
export function Timeline({
  items,
}: {
  items: { title: ReactNode; time?: ReactNode; body?: ReactNode; tone?: Tone }[];
}) {
  return (
    <ol className="ml-1 space-y-4 border-l border-border pl-5">
      {items.map((item, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden="true"
            className={`absolute -left-[24.5px] top-1.5 size-2 rounded-full ring-4 ring-background ${
              dotTone[item.tone ?? "neutral"]
            }`}
          />
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium">{item.title}</p>
            {item.time && <span className="shrink-0 text-xs tabular-nums text-muted">{item.time}</span>}
          </div>
          {item.body && <div className="mt-0.5 text-xs leading-5 text-muted">{item.body}</div>}
        </li>
      ))}
    </ol>
  );
}

/* Tables: horizontal hairlines only, figures right-aligned. */
export const tableClass = "w-full border-collapse text-left text-[13px]";
export const thClass =
  "h-10 border-b border-border px-3 text-xs font-medium text-muted first:pl-0 last:pr-0";
export const tdClass = "h-12 border-b border-border px-3 py-2.5 align-middle first:pl-0 last:pr-0";
export const rowClass =
  "cursor-pointer transition-colors hover:bg-surface focus-within:bg-surface";
export const numClass = "text-right tabular-nums";
