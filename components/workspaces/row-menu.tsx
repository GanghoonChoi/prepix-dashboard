"use client";
import {
  Children,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
 * opens onto an empty menu is a promise the row cannot keep. Callers pass
 * conditional children (`{canEdit && <RowMenuItem …>}`), so that verdict is
 * made HERE, from what actually survived — a caller that has to compute
 * "would any of these render" a second time gets it wrong eventually.
 *
 * The panel is PORTALLED to the body, and that is not tidiness. The members
 * table wraps itself in `overflow-x-auto` so a narrow window scrolls the table
 * instead of the page — and `overflow-x: auto` computes `overflow-y` to `auto`
 * as well, so an absolutely-positioned panel inside it is clipped at the
 * table's edge. The menu opened, drew a few pixels below the row, and was cut
 * off: it read as a button that does nothing, and the actions behind it read
 * as unimplemented.
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
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // `toArray` drops null/undefined/false, which is exactly the shape a row of
  // permission-gated items collapses to when the viewer may do nothing.
  const items = Children.toArray(children).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel is no longer inside `root`, so both have to be asked.
      if (!root.current?.contains(target) && !panel.current?.contains(target))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    /*
      Only a resize closes it now.

      It used to close on `scroll` with capture, because the panel was
      `position: fixed` and would otherwise sit still while its row moved away.
      That listener fires for EVERY scrolling element in the document — the
      members table is wrapped in `overflow-x-auto`, and the browser's own
      scroll-into-view counts — so the menu dismissed itself the instant
      anything tried to reach it. Positioned in document coordinates it simply
      travels with its row, and there is nothing to dismiss.
    */
    const onResize = () => setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  if (!items) return null;
  return (
    <div ref={root} className="relative inline-block text-left">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? (lang === "ko" ? "작업" : "Actions")}
        onClick={() => {
          // Measured here rather than in an effect: opening is the event that
          // decides where the panel goes, and the position is wanted in the
          // same commit that renders it.
          const box = trigger.current?.getBoundingClientRect();
          if (box) {
            // Not an estimate: every RowMenuItem is `min-h-10` with no gap
            // between them, inside a panel with `p-1`.
            const height = items * 40 + 8;
            const below = window.innerHeight - box.bottom;
            // Flip above the row when the panel would not fit beneath it, so a
            // kebab in the last rows does not open below the fold.
            const flip = below < height + 4 && box.top > below;
            setAt({
              top: flip
                ? box.top + window.scrollY - height - 4
                : box.bottom + window.scrollY + 4,
              // Document coordinates, so the panel travels with the page. The
              // dashboard column never scrolls sideways; the table does, and
              // the panel is deliberately outside it.
              right: document.documentElement.clientWidth - box.right,
            });
          }
          setOpen((was) => !was);
        }}
        className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground aria-expanded:bg-foreground/[0.06]"
      >
        <MoreVertical size={16} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open &&
        at &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            onClick={() => setOpen(false)}
            style={{ top: at.top, right: at.right }}
            className="absolute z-50 min-w-40 rounded-lg border border-border bg-background p-1 shadow-lg"
          >
            {children}
          </div>,
          document.body,
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
