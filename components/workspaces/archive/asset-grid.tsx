"use client";
import { FolderClosed, Play, Video } from "lucide-react";
import type { Asset, Folder } from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { bytes } from "@/lib/workspaces/upload";
import { storageLabel } from "@/lib/workspaces/asset-state";
import { isPlayable } from "@/lib/workspaces/archive-view";
import { posterKey } from "@/lib/workspaces/poster-cache";
import { AssetActions, type ArchiveHandlers } from "./asset-actions";

/**
 * The content archive as cards — folders as chips, files as frames.
 *
 * Posters come from this browser's cache: the player fills it, and
 * `useAutoPosters` makes the missing ones in the background (one early frame
 * each, a few at a time). `<img>` and not `<video>`: a grid of video elements
 * pointed at multi-GB originals would start a range request each on paint.
 */
export function AssetGrid({
  folders,
  assets,
  posters,
  onOpenFolder,
  onPreview,
  handlers,
}: {
  folders: Folder[];
  assets: Asset[];
  /** Poster data URLs by `posterKey`, for the ones this browser has seen. */
  posters: Map<string, string>;
  onOpenFolder: (folder: Folder) => void;
  onPreview: (asset: Asset) => void;
  handlers: ArchiveHandlers;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);

  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onOpenFolder(folder)}
              className="flex h-12 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-left text-[13px] transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-foreground"
            >
              <FolderClosed size={17} strokeWidth={1.5} className="shrink-0 text-muted" />
              <span className="min-w-0 truncate font-medium">{folder.name}</span>
            </button>
          ))}
        </div>
      )}
      {/* Cards like a drive or a review tool: the frame first, the name under
          it. auto-fill keeps each frame wide enough to tell two shots apart. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-6">
        {assets.map((asset) => {
          const playable = isPlayable(asset, handlers.now) && handlers.data.canDownload;
          const poster = posters.get(posterKey(asset));
          const ext = asset.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase();
          return (
            <figure key={asset.id} className="group min-w-0">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-secondary ring-1 ring-border transition-shadow group-hover:shadow-md">
                {poster ? (
                  /* A plain <img>: a data URL from this browser's own cache,
                     nothing for an image loader to fetch or resize. */
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={poster} alt="" className="size-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <span className="grid size-full place-items-center text-muted">
                    <Video size={24} strokeWidth={1.25} aria-hidden="true" />
                  </span>
                )}
                {ext && (
                  <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium tracking-wide text-white">
                    {ext}
                  </span>
                )}
                {playable && (
                  <button
                    onClick={() => onPreview(asset)}
                    aria-label={c(`${asset.name} 재생`, `Play ${asset.name}`)}
                    className="absolute inset-0 grid place-items-center transition-colors hover:bg-black/25 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                  >
                    <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Play size={16} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </button>
                )}
              </div>
              <figcaption className="mt-2 flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium" title={asset.name}>
                    {asset.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted tabular-nums">
                    {bytes(asset.size)} · {storageLabel(asset, lang, handlers.now)}
                  </p>
                </div>
                <AssetActions asset={asset} handlers={handlers} />
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
