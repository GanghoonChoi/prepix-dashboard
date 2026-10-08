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
import { AssetActions, type ArchiveHandlers } from "./asset-actions";
import { clock, statePill, typeIcon } from "./asset-grid";
import { ago } from "@/components/ui";

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
      className={`py-3 pr-4 font-normal ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={
        activeColumn ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex min-h-9 items-center gap-1 rounded-md px-1 transition-colors hover:text-foreground ${
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
  handlers: ArchiveHandlers;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <SortHeader column="name" label={c("이름", "Name")} sort={sort} onSort={onSort} />
            <SortHeader column="size" label={c("크기", "Size")} align="right" sort={sort} onSort={onSort} />
            <SortHeader column="createdAt" label={c("올린 날짜", "Uploaded")} sort={sort} onSort={onSort} />
            {/* `relative` contains the absolutely-positioned sr-only label,
                which would otherwise escape this table's overflow clip and
                scroll the whole page sideways on a phone. */}
            <th scope="col" className="relative w-24 py-3">
              <span className="sr-only">{c("작업", "Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr key={folder.id} className="border-b border-border transition-colors hover:bg-surface">
              <td colSpan={4} className="py-0">
                <button
                  className="flex min-h-14 w-full items-center gap-3 text-left"
                  onClick={() => onOpenFolder(folder)}
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
              <tr key={asset.id} className="group border-b border-border transition-colors hover:bg-surface">
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-3">
                    <span className="relative grid h-9 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-secondary text-muted ring-1 ring-border">
                      {poster ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data URL from this browser's cache
                        <img src={poster} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <Icon size={15} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {duration !== undefined && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-medium leading-4 tabular-nums text-white">
                          {clock(duration)}
                        </span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        {playable ? (
                          <button
                            className="min-w-0 truncate text-left font-medium underline-offset-4 hover:underline"
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
                        {pill && (
                          <span className="shrink-0 rounded-md bg-surface-secondary px-1.5 py-0.5 text-[11px] text-muted">
                            {pill}
                          </span>
                        )}
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
                <td className="py-2.5 pr-4 text-right tabular-nums text-muted">{bytes(asset.size)}</td>
                <td
                  className="whitespace-nowrap py-2.5 pr-4 tabular-nums text-muted"
                  title={`${new Date(asset.createdAt).toLocaleString(lang)} · ${storageLabel(asset, lang, handlers.now)}`}
                >
                  {ago(asset.createdAt, lang)}
                </td>
                <td className="py-2.5 text-right">
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
