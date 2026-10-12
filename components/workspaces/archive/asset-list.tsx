"use client";
import { ChevronDown, ChevronUp, FolderClosed } from "lucide-react";
import type { Asset, Folder } from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { bytes } from "@/lib/workspaces/upload";
import {
  previewAxis,
  previewFailureIsSpace,
  storageLabel,
} from "@/lib/workspaces/asset-state";
import {
  isPlayable,
  type ArchiveSort,
  type ArchiveSortKey,
} from "@/lib/workspaces/archive-view";
import { posterKey } from "@/lib/workspaces/poster-cache";
import { AssetActions, folderDropProps, SelectBox, type ArchiveHandlers } from "./asset-actions";
import { statePill, typeIcon } from "./asset-grid";
import {
  ago,
  Badge,
  numClass,
  rowClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { formatClock } from "@/lib/format";

/**
 * A sortable column header.
 *
 * Declared here rather than inside `AssetList`, because a component created
 * during render is a new component type on every render — React throws its
 * state away and remounts it each time.
 */
function SortHeader({
  column,
  label,
  align = "left",
  sort,
  onSort,
}: {
  column: ArchiveSortKey;
  label: string;
  align?: "left" | "right";
  sort: ArchiveSort;
  onSort: (key: ArchiveSortKey) => void;
}) {
  const activeColumn = sort.key === column;
  return (
    <th
      scope="col"
      className={`${thClass} ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        activeColumn ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-1 inline-flex h-8 items-center gap-1 rounded-md px-1 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-focus ${
          activeColumn ? "text-foreground" : ""
        }`}
      >
        {label}
        {activeColumn &&
          (sort.dir === "asc" ? (
            <ChevronUp size={13} strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
          ))}
      </button>
    </th>
  );
}

/**
 * The archive as a table you can order (2026-10-08, video-cloud list): a
 * thumbnail with the length on it, the name with a state pill only when the
 * file is not simply stored, then size and when — each sortable. Folders stay
 * above the files and out of the sort: they are navigation, not content.
 */
export function AssetList({
  folders,
  assets,
  posters,
  durations,
  sort,
  onSort,
  onOpenFolder,
  onPreview,
  onFreeUpSpace,
  onSelectAll,
  handlers,
}: {
  folders: Folder[];
  assets: Asset[];
  /** Poster data URLs by `posterKey` (thumbnail beside the name). */
  posters: Map<string, string>;
  /** Lengths in seconds by `posterKey`, where known. */
  durations: Map<string, number>;
  sort: ArchiveSort;
  onSort: (key: ArchiveSortKey) => void;
  onOpenFolder: (folder: Folder) => void;
  onPreview: (asset: Asset) => void;
  onFreeUpSpace: () => void;
  /** Pick every file shown, or none when all are picked. */
  onSelectAll: () => void;
  handlers: ArchiveHandlers;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const picked = assets.filter((a) => handlers.selected.has(a.id)).length;

  return (
    <div className="overflow-x-auto">
      <table className={`${tableClass} min-w-[36rem]`}>
        <thead>
          <tr>
            <th scope="col" className={`${thClass} w-10`}>
              {assets.length > 0 && (
                <input
                  type="checkbox"
                  aria-label={c("모든 파일 선택", "Select all files")}
                  className="size-4 cursor-pointer accent-foreground"
                  checked={picked > 0 && picked === assets.length}
                  ref={(box) => {
                    if (box) box.indeterminate = picked > 0 && picked < assets.length;
                  }}
                  onChange={onSelectAll}
                />
              )}
            </th>
            <SortHeader column="name" label={c("이름", "Name")} sort={sort} onSort={onSort} />
            <SortHeader column="size" label={c("크기", "Size")} align="right" sort={sort} onSort={onSort} />
            <SortHeader column="createdAt" label={c("올린 날짜", "Uploaded")} sort={sort} onSort={onSort} />
            {/* `relative` contains the absolutely-positioned sr-only label,
                which would otherwise escape this table's overflow clip and
                scroll the whole page sideways on a phone. */}
            <th scope="col" className={`${thClass} relative w-24`}>
              <span className="sr-only">{c("작업", "Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr key={folder.id} className={rowClass}>
              <td className="border-b border-border" />
              <td colSpan={4} className="border-b border-border p-0">
                <button
                  className="flex min-h-14 w-full items-center gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus data-[drop-target]:bg-surface-secondary data-[drop-target]:outline-2 data-[drop-target]:outline-foreground"
                  onClick={() => onOpenFolder(folder)}
                  {...folderDropProps(folder.id, handlers)}
                >
                  <span className="grid h-9 w-16 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
                    <FolderClosed size={16} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 truncate font-medium">{folder.name}</span>
                </button>
              </td>
            </tr>
          ))}
          {assets.map((asset) => {
            const playable = isPlayable(asset, handlers.now) && handlers.data.canDownload;
            // Only a failed preview earns a line; "check in the app" on every
            // stored file was noise next to a thumbnail that plays.
            const note = asset.previewState === "failed" ? previewAxis(asset, lang) : null;
            const key = posterKey(asset);
            const poster = posters.get(key);
            const duration = durations.get(key);
            const pill = statePill(asset, handlers.now, c);
            const Icon = typeIcon(asset.name);
            return (
              <tr
                key={asset.id}
                className={`group transition-colors hover:bg-surface ${handlers.selected.has(asset.id) ? "bg-surface" : ""}`}
              >
                <td className={`${tdClass} w-10`}>
                  <SelectBox asset={asset} handlers={handlers} />
                </td>
                <td className={tdClass}>
                  <div className="flex items-center gap-3">
                    <span className="relative grid h-9 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-secondary text-muted ring-1 ring-border">
                      {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL from this browser's cache
                        <img src={poster} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {duration !== undefined && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[11px] leading-4 tabular-nums text-white">
                          {formatClock(duration)}
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {playable ? (
                          <button
                            className="min-w-0 truncate rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                            title={asset.name}
                            onClick={() => onPreview(asset)}
                          >
                            {asset.name}
                          </button>
                        ) : (
                          <span className="min-w-0 truncate font-medium" title={asset.name}>
                            {asset.name}
                          </span>
                        )}
                        {pill && <Badge>{pill}</Badge>}
                      </div>
                      {note && (
                        <p className="mt-0.5 text-xs leading-5 text-muted">
                          {note}
                          {asset.previewState === "failed" && asset.failure && (
                            <>
                              {" "}
                              <span className="font-mono">{asset.failure}</span>
                              {previewFailureIsSpace(asset.failure) && (
                                <button className="ml-2 underline underline-offset-4" onClick={onFreeUpSpace}>
                                  {c("저장공간 정리하기", "Free up storage")}
                                </button>
                              )}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className={`${tdClass} ${numClass} text-muted`}>{bytes(asset.size)}</td>
                <td
                  className={`${tdClass} whitespace-nowrap tabular-nums text-muted`}
                  title={`${new Date(asset.createdAt).toLocaleString(lang)} · ${storageLabel(asset, lang, handlers.now)}`}
                >
                  {ago(asset.createdAt, lang)}
                </td>
                <td className={`${tdClass} text-right`}>
                  <div className="flex justify-end opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <AssetActions asset={asset} handlers={handlers} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
