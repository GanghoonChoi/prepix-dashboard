"use client";
import { File, FileAudio, Film, FolderClosed, ImageIcon, Play } from "lucide-react";
import type { Asset, Folder } from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { ago } from "@/components/ui";
import { bytes } from "@/lib/workspaces/upload";
import { storageLabel } from "@/lib/workspaces/asset-state";
import { isPlayable } from "@/lib/workspaces/archive-view";
import { posterKey } from "@/lib/workspaces/poster-cache";
import { AssetActions, type ArchiveHandlers } from "./asset-actions";

const VIDEO = /\.(mp4|m4v|mov|webm|mxf|avi|mkv)$/i;
const AUDIO = /\.(wav|mp3|aac|m4a|flac|aif|aiff)$/i;
const IMAGE = /\.(jpe?g|png|webp|gif|avif|heic|tiff?)$/i;
export function typeIcon(name: string) {
  return VIDEO.test(name) ? Film : AUDIO.test(name) ? FileAudio : IMAGE.test(name) ? ImageIcon : File;
}
/** 1:05 / 12:04 / 1:02:03 */
export function clock(seconds: number) {
  const s = Math.round(seconds),
    h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}
/** What a file is doing when it is not simply stored — the one pill a card
 * or row carries. Null for a plain, ready file. */
export function statePill(asset: Asset, now: number, c: (ko: string, en: string) => string) {
  if (asset.trashedAt) return c("휴지통", "Trash");
  if (asset.state === "uploading") return c("업로드 중", "Uploading");
  if (asset.state === "verifying") return c("확인 중", "Checking");
  if (asset.state === "quarantined") return c("격리됨", "Quarantined");
  if (asset.state === "cancelling" || asset.state === "cancelled") return c("취소됨", "Cancelled");
  if (new Date(asset.expiresAt).getTime() <= now) return c("보관 기한 만료", "Expired");
  return null;
}

/**
 * The content archive as cards, like a video cloud's grid (Frame.io, Drive;
 * 2026-10-08): folders first as compact tiles, then each file as a 16:9 frame
 * with its length and type on the frame, the name and "size · when" under it,
 * and its actions on the frame's corner when you point at it.
 *
 * Posters come from this browser's cache (`useAutoPosters` fills it); `<img>`
 * and not `<video>`, so a grid never starts a range request per tile.
 */
export function AssetGrid({
  folders,
  assets,
  posters,
  durations,
  onOpenFolder,
  onPreview,
  handlers,
}: {
  folders: Folder[];
  assets: Asset[];
  /** Poster data URLs by `posterKey`, for the ones this browser has seen. */
  posters: Map<string, string>;
  /** Lengths in seconds by `posterKey`, where known. */
  durations: Map<string, number>;
  onOpenFolder: (folder: Folder) => void;
  onPreview: (asset: Asset) => void;
  handlers: ArchiveHandlers;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);

  return (
    <div className="space-y-8">
      {folders.length > 0 && (
        <section className="space-y-3" aria-label={c("폴더", "Folders")}>
          <h2 className="text-xs font-medium text-muted">{c("폴더", "Folders")}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {folders.map((folder) => (
              <button
                key={folder.id}
                onClick={() => onOpenFolder(folder)}
                className="group flex h-14 items-center gap-3 rounded-xl border border-border bg-background px-3 text-left text-[13px] transition-colors hover:border-foreground/20 hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-secondary text-muted transition-colors group-hover:text-foreground">
                  <FolderClosed size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="min-w-0 truncate font-medium">{folder.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {assets.length > 0 && (
        <section className="space-y-3" aria-label={c("파일", "Files")}>
          <h2 className="text-xs font-medium text-muted tabular-nums">
            {c(`파일 ${assets.length}개`, `${assets.length} files`)}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-5 gap-y-7">
            {assets.map((asset) => {
              const playable = isPlayable(asset, handlers.now) && handlers.data.canDownload;
              const key = posterKey(asset);
              const poster = posters.get(key);
              const duration = durations.get(key);
              const ext = asset.name.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toUpperCase();
              const pill = statePill(asset, handlers.now, c);
              const Icon = typeIcon(asset.name);
              return (
                <figure key={asset.id} className="group min-w-0">
                  <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-secondary ring-1 ring-border transition group-hover:ring-foreground/25">
                    {poster ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a data URL from this browser's cache
                      <img
                        src={poster}
                        alt=""
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-muted">
                        <Icon size={28} strokeWidth={1.25} aria-hidden="true" />
                      </span>
                    )}
                    {playable && (
                      <button
                        onClick={() => onPreview(asset)}
                        aria-label={c(`${asset.name} 재생`, `Play ${asset.name}`)}
                        className="absolute inset-0 grid place-items-center bg-black/0 transition-colors hover:bg-black/20 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                      >
                        <span className="grid size-11 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                          <Play size={18} strokeWidth={2} className="translate-x-px" aria-hidden="true" />
                        </span>
                      </button>
                    )}
                    {pill && (
                      <span className="absolute left-2 top-2 rounded-md bg-background/90 px-1.5 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur">
                        {pill}
                      </span>
                    )}
                    {ext && (
                      <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-px text-[10px] font-medium tracking-wide text-white">
                        {ext}
                      </span>
                    )}
                    {duration !== undefined && (
                      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-px text-[11px] font-medium tabular-nums text-white">
                        {clock(duration)}
                      </span>
                    )}
                    {/* Actions sit on the frame's corner: there when you point
                        at the card or tab into it, out of the way otherwise. */}
                    <div className="absolute right-2 top-2 rounded-lg bg-background/90 opacity-0 shadow-sm backdrop-blur transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                      <AssetActions asset={asset} handlers={handlers} compact />
                    </div>
                  </div>
                  <figcaption className="mt-2.5 min-w-0 px-0.5">
                    <p className="truncate text-[13px] font-medium" title={asset.name}>
                      {asset.name}
                    </p>
                    <p
                      className="mt-0.5 truncate text-xs text-muted tabular-nums"
                      title={storageLabel(asset, lang, handlers.now)}
                    >
                      {bytes(asset.size)} · {ago(asset.createdAt, lang)}
                    </p>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
