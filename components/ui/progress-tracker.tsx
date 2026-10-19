"use client";

/**
 * A checklist with a progress bar — affectUI's Progress Tracker, on our tokens.
 *
 * Kept from the original: the ring that fills and pops, the tick that draws
 * itself, the strike that runs through a finished line, the count that rolls
 * up and the shine across the bar when progress grows. Changed: it is
 * controlled (the caller owns what is done), colours come from the theme
 * tokens so light and dark follow the app, and it has two modes:
 *
 * - `onToggle` given → each row is a checkbox the person ticks themselves
 *   (things that happen outside this page, like a first cut in the app);
 *   `current` there is the row last clicked, shaded.
 * - no `onToggle` → a read-only list of steps that the page itself completes,
 *   with `current` marking where the person is. A checkbox there would claim
 *   they can tick "pay" by clicking it.
 */
export type TrackerStep = {
  id: string;
  label: string;
  /** A muted second line. */
  hint?: string;
  done?: boolean;
};

export function ProgressTracker({
  title,
  steps,
  current,
  onToggle,
  className = "",
}: {
  title: string;
  steps: TrackerStep[];
  /** The step in progress; with `onToggle`, the one last clicked. */
  current?: string;
  onToggle?: (id: string) => void;
  className?: string;
}) {
  const total = steps.length;
  const count = steps.filter((s) => s.done).length;
  return (
    <div className={`ui-progress ${className}`} data-complete={count === total || undefined}>
      {/* React 19 hoists this into <head> once, however many trackers render. */}
      <style href="ui-progress-tracker" precedence="default">
        {css}
      </style>
      <div className="ui-progress__head">
        <h2 className="ui-progress__title">{title}</h2>
        <span className="ui-progress__count" aria-hidden="true">
          <span className="ui-progress__digit" key={count}>
            {count}
          </span>
          /{total}
        </span>
      </div>
      <div
        className="ui-progress__bar"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={count}
        aria-valuetext={`${count} / ${total}`}
      >
        <span className="ui-progress__fill" style={{ transform: `scaleX(${total ? count / total : 0})` }}>
          {/* A new key replays the shine each time progress grows. */}
          <span className="ui-progress__shine" key={count} />
        </span>
      </div>
      <ol className="ui-progress__list">
        {steps.map((step, index) => {
          const done = !!step.done;
          const inner = (
            <>
              <span className="ui-progress__check" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M6.5 12.5l3.5 3.5 7.5-8" pathLength={1} />
                </svg>
              </span>
              <span className="ui-progress__text">
                <span className="ui-progress__label">
                  <span>{step.label}</span>
                </span>
                {step.hint && <span className="ui-progress__hint">{step.hint}</span>}
              </span>
            </>
          );
          return (
            <li key={step.id} style={{ animationDelay: `${120 + index * 70}ms` }}>
              {onToggle ? (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  className="ui-progress__step"
                  data-done={done || undefined}
                  data-current={step.id === current || undefined}
                  onClick={() => onToggle(step.id)}
                >
                  {inner}
                </button>
              ) : (
                <div
                  className="ui-progress__step"
                  data-done={done || undefined}
                  data-current={step.id === current || undefined}
                  aria-current={step.id === current ? "step" : undefined}
                >
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const css = /* css */ `
.ui-progress {
  --ui-pg-card: var(--background);
  --ui-pg-line: var(--border);
  --ui-pg-ink: var(--foreground);
  --ui-pg-muted: var(--muted);
  --ui-pg-track: var(--surface-tertiary);
  --ui-pg-hover: var(--surface-secondary);
  --ui-pg-ease: cubic-bezier(0.22, 1, 0.36, 1);

  box-sizing: border-box;
  width: 100%;
  padding: 18px 12px 10px;
  background: var(--ui-pg-card);
  border: 1px solid var(--ui-pg-line);
  border-radius: 8px;
  color: var(--ui-pg-ink);
  animation: ui-progress-in 520ms var(--ui-pg-ease) both;
}
.ui-progress *, .ui-progress *::before, .ui-progress *::after { box-sizing: border-box; }

.ui-progress__head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 6px; }
.ui-progress__title { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.ui-progress__count { font-size: 13px; color: var(--ui-pg-muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* The number rolls in from below whenever it changes. */
.ui-progress__digit { display: inline-block; animation: ui-progress-roll 560ms var(--ui-pg-ease); }

.ui-progress__bar { position: relative; height: 6px; margin: 14px 6px 10px; border-radius: 999px; background: var(--ui-pg-track); overflow: hidden; }
.ui-progress__fill { position: absolute; inset: 0; border-radius: inherit; background: var(--ui-pg-ink); transform-origin: 0 50%; overflow: hidden; transition: transform 1100ms var(--ui-pg-ease); }
.ui-progress__shine {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent 30%, color-mix(in srgb, var(--ui-pg-card) 45%, transparent) 50%, transparent 70%) 0 0 / 220% 100% no-repeat;
  animation: ui-progress-shine 1400ms ease-out both;
}

.ui-progress__list { display: grid; gap: 1px; margin: 0; padding: 0; list-style: none; }
/* The rows fade up one after another as the card settles in. */
.ui-progress__list > li { animation: ui-progress-row-in 640ms var(--ui-pg-ease) both; }

.ui-progress__step {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; margin: 0;
  padding: 7px 6px; border: 0; border-radius: 6px; background: transparent;
  font: inherit; font-size: 13px; line-height: 20px; color: inherit; text-align: left;
}
button.ui-progress__step { cursor: pointer; transition: background-color 160ms ease; }
button.ui-progress__step:hover, button.ui-progress__step[data-current] { background: var(--ui-pg-hover); }
.ui-progress__step:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }

/* Checkbox: the ring fills and pops, then the tick draws itself. */
.ui-progress__check {
  position: relative; flex: none; display: grid; place-items: center;
  width: 18px; height: 18px; margin-top: 1px;
  border: 1.5px solid color-mix(in srgb, var(--ui-pg-muted) 70%, transparent);
  border-radius: 50%; background: transparent;
  transition: background-color 220ms var(--ui-pg-ease), border-color 220ms var(--ui-pg-ease);
}
.ui-progress__check svg {
  width: 12px; height: 12px; fill: none; stroke: var(--ui-pg-card); stroke-width: 2.6;
  stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1; stroke-dashoffset: 1;
  transition: stroke-dashoffset 120ms ease-in;
}
.ui-progress__step[data-done] .ui-progress__check {
  background: var(--ui-pg-ink); border-color: var(--ui-pg-ink);
  animation: ui-progress-pop 560ms var(--ui-pg-ease);
}
.ui-progress__step[data-done] .ui-progress__check svg { stroke-dashoffset: 0; transition: stroke-dashoffset 420ms var(--ui-pg-ease) 160ms; }
/* Where the person is now: a solid ring with a dot that breathes. */
.ui-progress__step[data-current] .ui-progress__check { border-color: var(--ui-pg-ink); }
.ui-progress__step[data-current] .ui-progress__check::after {
  content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--ui-pg-ink);
  animation: ui-progress-breathe 1800ms ease-in-out infinite;
}

.ui-progress__text { flex: 1; min-width: 0; display: grid; }
/* Label: greys out while a line strikes through it. */
.ui-progress__label { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 300ms ease; }
.ui-progress__label > span {
  background: linear-gradient(currentColor, currentColor) 0 58% / 0% 1.5px no-repeat;
  transition: background-size 380ms var(--ui-pg-ease);
}
.ui-progress__step:not([data-done]):not([data-current]):not(button) .ui-progress__label { color: var(--ui-pg-muted); }
.ui-progress__step[data-current] .ui-progress__label { font-weight: 500; }
.ui-progress__step[data-done] .ui-progress__label { color: var(--ui-pg-muted); }
.ui-progress__step[data-done] .ui-progress__label > span { background-size: 100% 1.5px; transition: background-size 620ms var(--ui-pg-ease) 220ms; }
.ui-progress__hint { font-size: 12px; line-height: 18px; color: var(--ui-pg-muted); text-wrap: pretty; }

@keyframes ui-progress-pop { 0% { transform: scale(0.9); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes ui-progress-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes ui-progress-row-in { from { opacity: 0; filter: blur(3px); transform: translateY(6px); } }
@keyframes ui-progress-roll { from { opacity: 0; transform: translateY(60%); } to { opacity: 1; transform: none; } }
@keyframes ui-progress-shine { from { background-position: 120% 0; opacity: 1; } to { background-position: -20% 0; opacity: 0; } }
@keyframes ui-progress-breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.7); } }

@media (prefers-reduced-motion: reduce) {
  .ui-progress, .ui-progress *, .ui-progress *::before, .ui-progress *::after {
    animation: none !important; transition-duration: 1ms !important; transition-delay: 0ms !important;
  }
}
`;
