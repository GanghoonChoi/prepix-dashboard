"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

/**
 * The kebab at the end of a table row.
 *
 * Rows carry two or three actions and only one of them is ever wanted, so a
 * row of buttons spends the width of the table on choices nobody is making.
 * Both reference products put them behind this.
 *
 * Render nothing when there is nothing to offer: an always-present kebab that
 * opens onto an empty menu is a promise the row cannot keep.
 */
export function RowMenu({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-block text-left">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? (lang === "ko" ? "작업" : "Actions")}
        onClick={() => setOpen((was) => !was)}
        className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground aria-expanded:bg-foreground/[0.06]"
      >
        <MoreVertical size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-40 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** One row of a `RowMenu`. `tone="danger"` for the ones that take something away. */
export function RowMenuItem({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-10 w-full items-center rounded-md px-2 text-left text-[13px] transition-colors disabled:opacity-50 ${
        tone === "danger"
          ? "text-danger hover:bg-danger/[0.08]"
          : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
