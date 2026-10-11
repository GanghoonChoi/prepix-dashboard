import type { ReactNode } from "react";

export const cardClass = "rounded-lg border border-border bg-background";

export function Card({
  className = "",
  padded = true,
  as: Tag = "section",
  children,
}: {
  className?: string;
  /** Off for cards whose first child is a full-bleed table or list. */
  padded?: boolean;
  as?: "section" | "div" | "article";
  children: ReactNode;
}) {
  return (
    <Tag className={`${cardClass} ${padded ? "p-5" : ""} ${className}`}>{children}</Tag>
  );
}

/** Title (+ muted count), one line of description, at most one action. */
export function CardHeader({
  title,
  count,
  description,
  action,
  divider = false,
}: {
  title: ReactNode;
  count?: number | string;
  description?: ReactNode;
  action?: ReactNode;
  /** A rule under the header, for cards whose body is a list. */
  divider?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${
        divider ? "-mx-5 -mt-5 mb-4 border-b border-border px-5 py-4" : "mb-4"
      }`}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal tabular-nums text-muted">{count}</span>
          )}
        </h2>
        {description && (
          <p className="mt-1 max-w-2xl text-pretty text-[13px] leading-5 text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** The card's last row: a note on the left, its action on the right. */
export function CardFooter({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`-mx-5 -mb-5 mt-5 flex flex-wrap items-center justify-between gap-3 rounded-b-lg border-t border-border bg-surface px-5 py-3 text-[13px] text-muted ${className}`}
    >
      {children}
    </div>
  );
}
