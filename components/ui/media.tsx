import type { ReactNode } from "react";
import { Clapperboard, type LucideIcon } from "lucide-react";
import { formatClock } from "@/lib/format";

/**
 * A video's frame: 16:9, the poster or a placeholder that stays visible in
 * dark mode, the length bottom-right and a state top-left. Title and meta go
 * UNDER it (the caller's), never as white text over the picture.
 */
export function Poster({
  src,
  alt = "",
  duration,
  badge,
  icon: Icon = Clapperboard,
  className = "",
  children,
}: {
  src?: string | null;
  /** Placeholder when there is no picture (audio, a document). */
  icon?: LucideIcon;
  alt?: string;
  /** Seconds. */
  duration?: number | null;
  badge?: ReactNode;
  className?: string;
  /** Extra overlays (a lock, an unread dot). */
  children?: ReactNode;
}) {
  return (
    <div
      className={`relative aspect-video overflow-hidden rounded-lg border border-border bg-surface-secondary ${className}`}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL
        <img src={src} alt={alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-muted">
          <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
        </span>
      )}
      {badge && <span className="absolute left-2 top-2 flex rounded-md bg-background shadow-sm">{badge}</span>}
      {duration != null && (
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-white">
          {formatClock(duration)}
        </span>
      )}
      {children}
    </div>
  );
}

const AVATAR_TONES = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-emerald-500",
];
/** A person's initial on a colour that stays the same for them everywhere. */
export function Avatar({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`grid shrink-0 place-items-center rounded-full font-medium text-white ${AVATAR_TONES[hash % AVATAR_TONES.length]}`}
    >
      {(Array.from(name.trim())[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Overlapping faces with "+N"; the names are for the caller to label. */
export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { id: string; name: string }[];
  max?: number;
  size?: number;
}) {
  const extra = people.length - max;
  return (
    <span className="flex items-center -space-x-1.5">
      {people.slice(0, max).map((person) => (
        <span key={person.id} className="rounded-full ring-2 ring-background">
          <Avatar id={person.id} name={person.name} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          aria-hidden="true"
          style={{ width: size, height: size }}
          className="grid place-items-center rounded-full bg-surface-tertiary text-[11px] font-medium tabular-nums ring-2 ring-background"
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
