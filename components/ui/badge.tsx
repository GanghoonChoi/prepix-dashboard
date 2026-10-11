import type { ReactNode } from "react";

/**
 * Status and attribute tags. Colour means state and nothing else: neutral for
 * attributes (외부, 뷰어, v2), a tinted tone only for success / waiting /
 * failure. No blue — a fourth hue would be a fourth meaning to learn.
 */
export type Tone = "neutral" | "success" | "warning" | "danger";

export const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-secondary text-foreground/80",
  success: "bg-success/10 text-success-ink",
  warning: "bg-warning/15 text-warning-ink",
  danger: "bg-danger/10 text-danger-ink",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className = "",
  children,
}: {
  tone?: Tone;
  /** A 6px dot in the tone's ink, for states that change (승인 대기 → 승인됨). */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium ${toneClass[tone]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** "Small grey tag beside a name" — the old API, kept for its callers. */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "danger";
}) {
  return <Badge tone={tone === "danger" ? "danger" : "neutral"}>{children}</Badge>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-surface-tertiary px-1 font-mono text-[11px] leading-none text-muted">
      {children}
    </kbd>
  );
}
