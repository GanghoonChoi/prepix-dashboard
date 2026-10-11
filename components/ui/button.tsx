import type { ButtonHTMLAttributes } from "react";

/**
 * One button, four jobs (docs/design/2026-10-12-design-system.md §2).
 * `buttonClass` is the source of truth so a <Link> can look exactly like a
 * <button>; `Button` and `IconButton` are the same classes with the attributes
 * that are easy to forget (type="button", an accessible name).
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm" | "xs";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,opacity] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-default disabled:opacity-40 aria-busy:cursor-wait [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-foreground hover:opacity-85 disabled:hover:opacity-40",
  secondary: "border border-border bg-background text-foreground hover:bg-surface-secondary",
  ghost: "text-foreground/80 hover:bg-surface-secondary hover:text-foreground",
  danger: "border border-danger/30 bg-background text-danger-ink hover:bg-danger/5",
};

// md keeps the 44px touch target below `sm`, 36px on a pointer.
const sizes: Record<ButtonSize, [string, string]> = {
  md: ["min-h-11 px-3.5 text-[13px] sm:min-h-9", "size-11 sm:size-9"],
  sm: ["h-8 px-3 text-[13px]", "size-8"],
  xs: ["h-7 px-2.5 text-xs", "size-7"],
};

export function buttonClass({
  variant = "primary",
  size = "md",
  icon = false,
}: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean } = {}) {
  return `${base} ${variants[variant]} ${sizes[size][icon ? 1 : 0]}`;
}

export function Button({
  variant,
  size,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={`${buttonClass({ variant, size })} ${className}`}
      {...props}
    />
  );
}

/** Square, icon only — so the label is required, not optional. */
export function IconButton({
  label,
  variant = "ghost",
  size = "sm",
  className = "",
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  label: string;
  variant?: "ghost" | "secondary";
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`${buttonClass({ variant, size, icon: true })} ${
        variant === "ghost" ? "text-muted" : ""
      } ${className}`}
      {...props}
    />
  );
}
