"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";

/**
 * A "?" beside a label that opens a short explanation — in place of the
 * "▸ 자세히" folds that pushed paragraphs into the page under every section.
 *
 * Click, not hover: hover help does not exist on a phone, and a fold that
 * moves the page is worse than a card that floats over it. Built on the
 * native Popover API, so the browser handles the parts that are easy to get
 * wrong — light dismiss (a click anywhere else), Escape, focus going back to
 * the "?", and the top layer (no clipping inside scrolling tables). Only the
 * placement is ours.
 *
 * For a definition or a rule of thumb, never for something a person needs in
 * order to act — that stays on the page.
 */
export function InfoTip({
  label,
  text,
  children,
  wide = false,
  className = "",
}: {
  /** The question the "?" answers; its accessible name and the card's title. */
  label: string;
  /**
   * A few words shown beside the "?", for a spot with no heading to sit next
   * to (a form footer, the end of a paragraph). Without it, the "?" alone.
   */
  text?: string;
  children: ReactNode;
  /** A reference card (the role guide), not a sentence: 560px instead of 320px. */
  wide?: boolean;
  className?: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = card.current;
    if (!node) return;
    // Under the "?", centred on it, kept 8px inside the viewport; above it
    // when there is no room below.
    const place = () => {
      const at = trigger.current?.getBoundingClientRect();
      if (!at) return;
      // Before the first paint the card has no size yet, so the width comes
      // from its own CSS rule (min(320px or 560px, 100vw - 16px)) and the
      // flip waits for the real height on "toggle".
      const width = node.offsetWidth || Math.min(wide ? 560 : 320, window.innerWidth - 16);
      const height = node.offsetHeight;
      const left = Math.min(
        Math.max(8, at.left + at.width / 2 - width / 2),
        window.innerWidth - width - 8,
      );
      const below = at.bottom + 8;
      const top =
        below + height > window.innerHeight - 8 && at.top - 8 - height > 8
          ? at.top - 8 - height
          : below;
      node.style.left = `${left}px`;
      // A card taller than the room on either side stays on screen and
      // scrolls inside (max-height), covering the "?" rather than the fold.
      node.style.top = `${Math.max(8, Math.min(top, window.innerHeight - height - 8))}px`;
    };
    // A page that scrolls under an open card would leave it pointing at
    // nothing; closing is what a menu does too. Scrolling the card itself
    // (a tall one) is reading it, not leaving it.
    const close = (event: Event) => {
      if (event.type === "scroll" && node.contains(event.target as Node)) return;
      node.hidePopover?.();
    };
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") {
        place();
        window.addEventListener("scroll", close, { capture: true });
        window.addEventListener("resize", close, { once: true });
      } else {
        window.removeEventListener("scroll", close, { capture: true });
        window.removeEventListener("resize", close);
      }
    };
    const beforeToggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "open") place();
    };
    node.addEventListener("beforetoggle", beforeToggle);
    node.addEventListener("toggle", onToggle);
    return () => {
      node.removeEventListener("beforetoggle", beforeToggle);
      node.removeEventListener("toggle", onToggle);
    };
  }, [wide]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        popoverTarget={id}
        aria-label={text ? undefined : label}
        title={label}
        className={
          text
            ? `inline-flex items-center gap-1 rounded-md text-[13px] text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${className}`
            : `inline-grid size-5 shrink-0 place-items-center rounded-full align-middle text-muted transition-colors hover:bg-surface-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${className}`
        }
      >
        <CircleHelp size={14} strokeWidth={1.75} aria-hidden="true" />
        {text}
      </button>
      <div
        ref={card}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={label}
        className={`fixed inset-auto m-0 ${wide ? "max-h-[calc(100vh-16px)] w-[min(560px,calc(100vw-16px))] overflow-y-auto" : "w-[min(320px,calc(100vw-16px))]"} rounded-lg border border-border bg-overlay p-4 text-left text-[13px] font-normal leading-5 text-foreground shadow-[0_8px_30px_rgba(0,0,0,0.12)]`}
      >
        <p className="mb-1.5 text-[13px] font-semibold">{label}</p>
        <div className="space-y-2 text-muted [&_strong]:font-medium [&_strong]:text-foreground">
          {children}
        </div>
      </div>
    </>
  );
}
