import type { Asset } from "../api/services/cloud.service";

/**
 * How the archive is ordered and which rows can be opened in a player.
 *
 * Pure, and separate from the page, because both answers are easy to get
 * subtly wrong and neither needs React to be checked.
 */
export type ArchiveSortKey = "name" | "size" | "createdAt";
export type ArchiveSort = { key: ArchiveSortKey; dir: "asc" | "desc" };

export type ArchiveView = "grid" | "list";

/** The one `state` whose bytes are complete and released for download. */
export const READY_TO_PLAY = "ready" as const;

/**
 * `localeCompare` with `numeric`, not `<`.
 *
 * Cameras and editors number their output, and code-point order puts clip10
 * between clip1 and clip2 — wrong for essentially every real archive. The
 * collator also orders Korean by its own rules rather than by code point,
 * which is the difference between a usable list and an arbitrary one.
 *
 * Built once: constructing an Intl.Collator per comparison is the expensive
 * way to do this, and a sort calls the comparator O(n log n) times.
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

type Sortable = Pick<Asset, "name" | "size" | "createdAt">;

export function sortAssets<T extends Sortable>(
  assets: readonly T[],
  sort: ArchiveSort,
): T[] {
  const direction = sort.dir === "asc" ? 1 : -1;
  // `toSorted` is not available on every runtime this ships to, and sorting in
  // place would reorder the caller's array — which here is the server response
  // held in state.
  return [...assets].sort((a, b) => {
    const compared =
      sort.key === "name"
        ? collator.compare(a.name, b.name)
        : sort.key === "size"
          ? a.size - b.size
          : Date.parse(a.createdAt) - Date.parse(b.createdAt);
    // Array.prototype.sort is stable, so returning 0 for a tie keeps the
    // server's own order rather than inventing one.
    return compared * direction;
  });
}

/**
 * What clicking a column header does.
 *
 * The same column flips direction; a different one starts at the end people
 * actually want first — newest and largest, but names from A.
 */
export function nextSort(current: ArchiveSort, key: ArchiveSortKey): ArchiveSort {
  if (current.key === key)
    return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

/**
 * Whether opening this asset in a player could possibly work.
 *
 * Not a guess about the codec — nothing here knows that, and the server has no
 * mime column to ask. This is only about whether the BYTES are available: the
 * download route refuses anything that is still arriving, quarantined, trashed
 * or past its retention date, so offering a player for those would open onto a
 * signed URL the server declines.
 */
export function isPlayable(
  asset: { state: string; trashedAt: string | null; expiresAt: string },
  now = Date.now(),
) {
  return (
    asset.state === READY_TO_PLAY &&
    !asset.trashedAt &&
    new Date(asset.expiresAt).getTime() > now
  );
}
