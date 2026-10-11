import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Tone } from "./badge";

const notice: Record<Tone, { box: string; icon?: LucideIcon; ink: string }> = {
  neutral: { box: "bg-surface-secondary", ink: "text-muted" },
  success: { box: "bg-success/10", icon: CircleCheck, ink: "text-success-ink" },
  warning: { box: "bg-warning/15", icon: TriangleAlert, ink: "text-warning-ink" },
  danger: { box: "bg-danger/10", icon: CircleAlert, ink: "text-danger-ink" },
};

/**
 * A state worth noticing. Neutral is the quiet one-line callout it always
 * was; a tone adds its icon, and an action sits at the right end.
 */
export function Notice({
  tone = "neutral",
  title,
  action,
  role,
  className = "",
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  action?: ReactNode;
  role?: "status" | "note" | "alert";
  className?: string;
  children?: ReactNode;
}) {
  const { box, icon: Icon, ink } = notice[tone];
  return (
    <div
      role={role}
      className={`flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg px-3.5 py-2.5 text-[13px] leading-5 ${box} ${className}`}
    >
      {Icon && <Icon size={16} strokeWidth={1.75} aria-hidden="true" className={`mt-0.5 shrink-0 ${ink}`} />}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-foreground/80" : ""}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/**
 * Nothing here yet: one line, and the one thing to do about it. Anchored to
 * the top of its area, not floated in the middle of the page. `dashed` only
 * for areas you can drop files on — the dash means "put something here".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  frame = "solid",
  className = "",
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  frame?: "solid" | "dashed" | "none";
  className?: string;
}) {
  const border =
    frame === "none" ? "" : frame === "dashed" ? "rounded-lg border border-dashed border-border" : "rounded-lg border border-border";
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${border} ${className}`}>
      {Icon && (
        <span className="mb-3 grid size-10 place-items-center rounded-lg bg-surface-secondary text-muted">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-medium">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-pretty text-[13px] leading-5 text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
