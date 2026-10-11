import type { ReactNode } from "react";
import { cardClass, CardFooter } from "./card";

/**
 * A settings section: a card with a title, its rows and (when it saves) a
 * footer. `flush` drops the card for pages that separate sections with a rule
 * instead — the old `Block`.
 */
export function SettingsSection({
  title,
  description,
  action,
  footer,
  id,
  label,
  flush = false,
  className = "",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  id?: string;
  /** Names the section as a landmark (role region) when given. */
  label?: string;
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const head = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 max-w-2xl text-pretty text-[13px] leading-5 text-muted">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
  if (flush)
    return (
      <section
        id={id}
        aria-label={label}
        className={`space-y-4 border-b border-border pb-8 last:border-b-0 last:pb-0 ${className}`}
      >
        {head}
        {children}
      </section>
    );
  return (
    <section id={id} aria-label={label} className={`${cardClass} p-5 ${className}`}>
      {head}
      {children && <div className="mt-5">{children}</div>}
      {footer && <CardFooter>{footer}</CardFooter>}
    </section>
  );
}

/** One setting: what it is on the left, its control on the right. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children?: ReactNode;
}) {
  const Label = htmlFor ? "label" : "p";
  return (
    <div className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-pretty text-[13px] leading-5 text-muted">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Irreversible actions, set apart by a red-tinted rule — never a red fill. */
export function DangerZone({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-danger/30 p-5">
      <h2 className="text-base font-semibold text-danger-ink">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
