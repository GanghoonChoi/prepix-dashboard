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
 * The archive as tiles — the icon half of a media panel.
 *
 * A tile shows a poster only if this browser has one, and it never fetches to
 * get one: the frames come from clips the viewer already opened (see
 * `poster-cache`). Until the server grows a proxy pipeline that is the honest
 * state of things, and an empty tile says "not watched here yet" rather than
 * pretending to be a thumbnail service.
 *
 * `<img>` and not `<video>` on purpose. A grid of twenty video elements
 * pointed at 4 GB originals would start twenty range requests on paint, and
 * those bytes are the bill.
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
    /* Three across at most. Four fitted the measure but left each tile about
       150px wide, which is too small to tell two shots apart — and a grid whose
       frames cannot be read is a list with worse density. */
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onOpenFolder(folder)}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-border p-4 text-left text-sm transition-colors hover:bg-surface"
        >
          <FolderClosed size={18} strokeWidth={1.5} className="shrink-0" />
          <span className="min-w-0 break-all font-medium">{folder.name}</span>
        </button>
      ))}
      {assets.map((asset) => {
        const playable = isPlayable(asset, handlers.now) && handlers.data.canDownload;
        const poster = posters.get(posterKey(asset));
        return (
          <figure
            key={asset.id}
            className="overflow-hidden rounded-xl border border-border"
          >
            <div className="relative aspect-video bg-foreground/[0.04]">
              {poster ? (
                /* A plain <img>, not next/image: the source is a data URL held
                   in this browser's own IndexedDB. There is nothing for an
                   image loader to fetch, resize or cache, and routing it
                   through one would add a round trip to bytes we already
                   have. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={poster}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="grid size-full place-items-center text-muted">
                  <Video size={26} strokeWidth={1.25} aria-hidden="true" />
                </span>
              )}
              {playable && (
                <button
                  onClick={() => onPreview(asset)}
                  aria-label={c(`${asset.name} 재생`, `Play ${asset.name}`)}
                  className="group absolute inset-0 grid place-items-center transition-colors hover:bg-black/30 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                >
                  <span className="grid size-10 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Play size={16} strokeWidth={2} aria-hidden="true" />
                  </span>
                </button>
              )}
            </div>
            <figcaption className="flex items-start gap-1 p-3">
              <div className="min-w-0 flex-1">
                {/* One line each, clipped. A file name has no spaces to wrap
                    at, so letting it break produced "raw_master." above "mov";
                    the full name is a hover away and spelled out in the list
                    view. */}
                <p className="truncate text-sm font-medium" title={asset.name}>
                  {asset.name}
                </p>
                <p className="mt-0.5 truncate text-xs leading-5 text-muted tabular-nums">
                  {bytes(asset.size)} · {storageLabel(asset, lang, handlers.now)}
                </p>
              </div>
              <AssetActions asset={asset} handlers={handlers} />
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
