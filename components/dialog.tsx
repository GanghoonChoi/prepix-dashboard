"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { useI18n } from "@/lib/i18n/context";

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialog({
  state,
  title,
  size = "default",
  children,
}: {
  state: UseOverlayStateReturn;
  title: string;
  /**
   * `wide` for content that compares things side by side. A role table has a
   * column per role, and squeezing five columns into the default 28rem broke
   * the headers onto two lines and pushed the last two columns out of sight —
   * technically scrollable, invisibly so.
   *
   * `player` for video. A 16:9 frame in 28rem is a postage stamp, and the
   * point of opening a clip is seeing it.
   */
  size?: "default" | "wide" | "player";
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { lang } = useI18n();
  const closeLabel = lang === "ko" ? "닫기" : "Close";

  useEffect(() => {
    if (!state.isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const items = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
    // Move focus into the dialog on open.
    (items()[0] ?? panelRef.current)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        state.close();
        return;
      }
      if (e.key === "Tab") {
        const focusables = items();
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isOpen]);

  if (!state.isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/60"
        onClick={() => state.close()}
        aria-hidden="true"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={`relative w-full ${
            size === "player"
              ? "max-w-5xl"
              : size === "wide"
                ? "max-w-2xl"
                : "max-w-md"
          } rounded-lg border border-border bg-background p-6 shadow-lg outline-none`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* `pr-10` keeps a long title from running under the close button. */}
          <h3
            id={titleId}
            className="pr-10 text-lg font-semibold text-foreground"
          >
            {title}
          </h3>
          <div className="mt-4">{children}</div>
          {/*
            The way out, guaranteed.

            Escape and a backdrop click always worked, but neither is visible —
            and every dialog so far happened to carry its own 취소 or 닫기, so
            nothing here did. Then the player arrived: its content is a video
            that fills the panel, it had no cancel button of its own, and on a
            small window it leaves almost no backdrop to click. There was no
            way out anyone could SEE.

            Last in the DOM on purpose. The panel focuses its first focusable
            element on open, and a close button placed first would take that
            from the field people came to type in.
          */}
          <button
            type="button"
            onClick={() => state.close()}
            aria-label={closeLabel}
            title={closeLabel}
            className="absolute right-4 top-4 grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            <X size={18} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
