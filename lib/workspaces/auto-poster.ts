"use client";
import { useEffect, useRef } from "react";
import { cloudService, type Asset } from "@/lib/api/services/cloud.service";
import { isPlayable } from "./archive-view";
import { captureFrame, posterKey, writePoster } from "./poster-cache";

const VIDEO = /\.(mp4|m4v|mov|webm)$/i;
const IMAGE = /\.(jpe?g|png|webp|gif|avif)$/i;
// ponytail: thumbnails are made in the browser from the originals (no server
// proxy yet): two at a time, at most this many per folder view, each read only
// as far as one early frame. A server-side poster for the archive replaces this.
const PER_VIEW = 24;
const CONCURRENCY = 2;

export const posterable = (asset: Asset) => VIDEO.test(asset.name) || IMAGE.test(asset.name);

/** One frame a little into a video, or the image itself, as a JPEG data URL;
 * a video's length (seconds) comes with it. */
type Grab = { frame?: string; duration?: number };
function grab(url: string, image: boolean): Promise<Grab> {
  return new Promise((resolve) => {
    let duration: number | undefined;
    const done = (frame?: string) => {
      clearTimeout(timer);
      resolve({ frame, duration });
    };
    const timer = setTimeout(() => done(), 20_000);
    if (image) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        try {
          const scale = Math.min(1, 480 / img.naturalWidth);
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
          done(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          done();
        }
      };
      img.onerror = () => done();
      img.src = url;
      return;
    }
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    const stop = (value?: string) => {
      video.removeAttribute("src");
      video.load();
      done(value);
    };
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) duration = video.duration;
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => stop(captureFrame(video));
    video.onerror = () => stop();
    video.src = url;
  });
}

/**
 * Content-archive thumbnails (2026-10-08): files on screen that this browser
 * has no poster for get one in the background — a frame of a video, or the
 * image itself — kept in the same per-browser cache the player fills. A poster
 * is a nicety: any failure (CORS, codec, network) just leaves the icon.
 */
export function useAutoPosters({
  workspaceId,
  assets,
  posters,
  enabled,
  onPoster,
}: {
  workspaceId: string;
  assets: Asset[];
  posters: Map<string, string>;
  enabled: boolean;
  onPoster: (key: string, dataUrl: string, duration?: number) => void;
}) {
  const tried = useRef(new Set<string>());
  const report = useRef(onPoster);
  const have = useRef(posters);
  useEffect(() => {
    report.current = onPoster;
    have.current = posters;
  });
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const queue = assets
      .filter((a) => posterable(a) && isPlayable(a, now) && !have.current.has(posterKey(a)) && !tried.current.has(posterKey(a)))
      .slice(0, PER_VIEW);
    if (!queue.length) return;
    let live = true;
    const worker = async () => {
      for (let asset = queue.shift(); asset && live; asset = queue.shift()) {
        const key = posterKey(asset);
        tried.current.add(key);
        try {
          const { url } = await cloudService.download(workspaceId, asset.id);
          // A frame already on its way is kept even if the view moved on.
          const { frame, duration } = await grab(url, IMAGE.test(asset.name));
          if (!frame) continue;
          report.current(key, frame, duration);
          void writePoster(key, frame, duration);
        } catch {
          /* leave the icon */
        }
      }
    };
    for (let i = 0; i < CONCURRENCY; i++) void worker();
    return () => {
      live = false;
    };
  }, [workspaceId, assets, enabled]);
}
