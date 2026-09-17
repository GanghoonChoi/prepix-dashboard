"use client";
import { ChevronDown, ChevronUp, FolderClosed, Play } from "lucide-react";
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
import { AssetActions, type ArchiveHandlers } from "./asset-actions";

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
 * The archive as a table you can order — the list half of a media panel.
 *
 * It was a `<ul>` of stacked lines, which reads fine at one file and tells you
 * nothing at fifty: you could not answer "what is the biggest thing in here"
 * or "what arrived last" without reading every row. Columns answer both by
 * being clickable.
 *
 * Folders stay above the files and out of the sort. They are navigation, not
 * content, and ordering them by size would be ordering them by nothing.
 */
export function AssetList({
  folders,
  assets,
  sort,
  onSort,
  onOpenFolder,
  onPreview,
  onFreeUpSpace,
  handlers,
}: {
  folders: Folder[];
  assets: Asset[];
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
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <SortHeader
              column="name"
              label={c("이름", "Name")}
              sort={sort}
              onSort={onSort}
            />
            <th scope="col" className="py-3 pr-4 font-normal">
              {c("상태", "Status")}
            </th>
            <SortHeader
              column="size"
              label={c("용량", "Size")}
              align="right"
              sort={sort}
              onSort={onSort}
            />
            <SortHeader
              column="createdAt"
              label={c("올린 날짜", "Uploaded")}
              sort={sort}
              onSort={onSort}
            />
            {/* `relative` contains the absolutely-positioned sr-only label,
                which would otherwise escape this table's overflow clip and
                scroll the whole page sideways on a phone. */}
            <th scope="col" className="relative w-12 py-3">
              <span className="sr-only">{c("작업", "Actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => (
            <tr
              key={folder.id}
              className="border-b border-border transition-colors hover:bg-foreground/[0.02]"
            >
              <td colSpan={5} className="py-0">
                <button
                  className="flex min-h-14 w-full items-center gap-3 text-left"
                  onClick={() => onOpenFolder(folder)}
                >
                  <FolderClosed size={18} strokeWidth={1.5} className="shrink-0" />
                  <span className="break-all font-medium">{folder.name}</span>
                </button>
              </td>
            </tr>
          ))}
          {assets.map((asset) => {
            const playable = isPlayable(asset, handlers.now) && handlers.data.canDownload;
            const note = previewAxis(asset, lang);
            return (
              <tr
                key={asset.id}
                className="border-b border-border align-top transition-colors hover:bg-foreground/[0.02]"
              >
                <td className="py-3.5 pr-4">
                  <div className="flex items-start gap-2">
                    {playable ? (
                      <button
                        className="min-w-0 break-all text-left font-medium underline-offset-4 hover:underline"
                        onClick={() => onPreview(asset)}
                      >
                        {asset.name}
                      </button>
                    ) : (
                      <span className="break-all font-medium">{asset.name}</span>
                    )}
                    {playable && (
                      <Play
                        size={13}
                        strokeWidth={2}
                        aria-hidden="true"
                        className="mt-1 shrink-0 text-muted"
                      />
                    )}
                  </div>
                  {note && (
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {note}
                      {asset.previewState === "failed" && asset.failure && (
                        <>
                          {" "}
                          <span className="font-mono">{asset.failure}</span>
                          {previewFailureIsSpace(asset.failure) && (
                            <button
                              className="ml-2 underline underline-offset-4"
                              onClick={onFreeUpSpace}
                            >
                              {c("저장공간 정리하기", "Free up storage")}
                            </button>
                          )}
                        </>
                      )}
                    </p>
                  )}
                </td>
                <td className="py-3.5 pr-4 text-muted">
                  {storageLabel(asset, lang, handlers.now)}
                </td>
                <td className="py-3.5 pr-4 text-right tabular-nums text-muted">
                  {bytes(asset.size)}
                </td>
                <td className="py-3.5 pr-4 tabular-nums text-muted">
                  {new Date(asset.createdAt).toLocaleDateString(lang)}
                </td>
                <td className="py-3.5 text-right">
                  <AssetActions asset={asset} handlers={handlers} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
