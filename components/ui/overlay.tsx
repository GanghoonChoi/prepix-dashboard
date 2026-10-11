"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

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
/** A label row inside a menu (a group heading, or the signed-in account). */
export const menuLabelClass = "px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted";
export const menuSeparatorClass = "-mx-1 my-1 border-t border-border";
export const menuItemClass =
  "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary";

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
          <X size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-6 p-5">{children}</div>
    </dialog>
  );
}
