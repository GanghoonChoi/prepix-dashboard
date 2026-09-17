"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useI18n } from "@/lib/i18n/context";
import { cloudService, type Asset } from "@/lib/api/services/cloud.service";
import { bytes } from "@/lib/workspaces/upload";
import { captureFrame, posterKey, writePoster } from "@/lib/workspaces/poster-cache";
import { secondaryClass } from "@/components/workspaces/shared";

/**
 * Watch an original without leaving the archive.
 *
 * There is no proxy, so this plays the ORIGINAL through the same signed URL
 * the download button uses. Three things follow from that, and each one is
 * handled rather than hoped away:
 *
 *  1. The URL lives 60 seconds (`expiresIn: 60` on the server). A clip longer
 *     than that keeps making range requests, and they start coming back 403
 *     mid-playback. So a network error re-signs and restores the position
 *     instead of showing a broken player.
 *  2. Nothing knows the codec — there is no mime column to ask. So this
 *     attaches optimistically and only says "cannot play" once the browser
 *     itself has refused, rather than guessing from a file extension and
 *     hiding a clip that would have played.
 *  3. These are the real bytes, and bytes are the bill. Nothing preloads:
 *     the request happens when somebody opens this, never for a tile.
 */

/**
 * Whether the storage origin lets us read the pixels back.
 *
 * Capturing a poster needs `crossOrigin="anonymous"`, and that in turn needs
 * the bucket to answer with `Access-Control-Allow-Origin` — otherwise the media
 * load fails outright and the clip does not play at all. Playback must never
 * depend on a bucket setting, so the first load asks for CORS, and if that
 * fails the element is remade without it: the video plays, the canvas is
 * tainted, and there is simply no poster.
 *
 * Module scope on purpose. It is a fact about the deployment, not about a
 * clip, so one failed attempt per session is enough to learn it.
 */
let corsReadable = true;
export function PreviewModal({
  state,
  workspaceId,
  assets,
  index,
  onIndex,
  onDownload,
  onPoster,
}: {
  /** Owned by the page, so the dialog restores focus to the tile that opened it. */
  state: UseOverlayStateReturn;
  workspaceId: string;
  /** The playable rows, in the order the archive shows them. */
  assets: Asset[];
  index: number;
  onIndex: (next: number) => void;
  onDownload: (asset: Asset) => void;
  /** A frame was captured for this key — the grid swaps its icon for it. */
  onPoster: (key: string, dataUrl: string) => void;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const asset = assets[index];
  const video = useRef<HTMLVideoElement>(null);
  /*
    Both of these carry the id they belong to, and the values below are derived
    from that rather than cleared when the clip changes.

    Clearing them in an effect meant a render where `src` still held the
    PREVIOUS clip's URL while `asset` was already the next one — the player
    would start loading the wrong file for a frame — and it put a synchronous
    setState in an effect body, which is the cascading render React warns
    about. Deriving has neither problem.
  */
  const [signed, setSigned] = useState<{
    id: string;
    url: string;
    at: number;
  } | null>(null);
  const [failed, setFailed] = useState<{
    id: string;
    kind: "codec" | "network";
  } | null>(null);
  const src = signed?.id === asset.id ? signed.url : "";
  // Re-rendered rather than read once, so flipping it remounts the element.
  const [anonymous, setAnonymous] = useState(corsReadable);
  const failure = failed?.id === asset.id ? failed.kind : "";
  // Where to come back to after a re-sign, and how many re-signs this clip has
  // already spent. Without the cap a genuinely broken file re-signs forever.
  const resumeAt = useRef(0);
  const retries = useRef(0);

  const sign = useCallback(async () => {
    const id = asset.id;
    try {
      const { url } = await cloudService.download(workspaceId, id);
      setSigned({ id, url, at: Date.now() });
      setFailed((prev) => (prev?.id === id ? null : prev));
    } catch {
      setFailed({ id, kind: "network" });
    }
  }, [workspaceId, asset.id]);

  /*
    A new clip is a new URL and a fresh retry budget.

    The request is written out here rather than calling `sign()` so the state
    updates sit visibly in the promise's callbacks — subscribing to an external
    system and answering when it replies, which is what an effect is for. The
    same work behind an async helper reads to both a linter and a person as a
    synchronous setState in an effect body.
  */
  useEffect(() => {
    resumeAt.current = 0;
    retries.current = 0;
    let live = true;
    const id = asset.id;
    cloudService
      .download(workspaceId, id)
      .then(({ url }) => {
        if (!live) return;
        setSigned({ id, url, at: Date.now() });
        setFailed((prev) => (prev?.id === id ? null : prev));
      })
      .catch(() => {
        if (live) setFailed({ id, kind: "network" });
      });
    return () => {
      live = false;
    };
  }, [workspaceId, asset.id]);

  const store = useCallback(
    (node: HTMLVideoElement) => {
      const frame = captureFrame(node);
      if (!frame) return;
      const key = posterKey(asset);
      onPoster(key, frame);
      void writePoster(key, frame);
    },
    [asset, onPoster],
  );

  /**
   * Re-sign when the URL is too old to survive the next request.
   *
   * The server signs for 60 seconds. That is plenty for a click-and-watch, and
   * nowhere near enough for a modal that has been open while somebody reads
   * the file name — so anything that is about to pull bytes checks the age
   * first rather than discovering the 403 afterwards.
   */
  const FRESH_MS = 45_000;
  const refreshIfStale = useCallback(() => {
    const node = video.current;
    if (!node || signed?.id !== asset.id) return;
    if (Date.now() - signed.at < FRESH_MS) return;
    resumeAt.current = node.currentTime;
    void sign();
  }, [signed, asset.id, sign]);

  const step = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < assets.length) onIndex(next);
    },
    [index, assets.length, onIndex],
  );

  // ← and → move between clips, the way a media panel does. Escape is the
  // Dialog's own, and the arrows stay out of the way while the player itself
  // has focus so they can still scrub it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "VIDEO" || target?.closest("input")) return;
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <Dialog state={state} size="player" title={asset.name}>
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-lg bg-black">
          {failure === "codec" ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm leading-6 text-white/80">
                {c(
                  "이 형식은 브라우저에서 재생할 수 없습니다. 원본은 그대로 보관되어 있습니다.",
                  "This format cannot play in a browser. The original is stored and intact.",
                )}
              </p>
              <button
                className={`${secondaryClass} border-white/30 text-white hover:bg-white/10`}
                onClick={() => onDownload(asset)}
              >
                <Download size={16} strokeWidth={1.5} />
                {c("원본 다운로드", "Download original")}
              </button>
            </div>
          ) : (
            <video
              ref={video}
              key={`${asset.id}:${anonymous}`}
              src={src || undefined}
              crossOrigin={anonymous ? "anonymous" : undefined}
              controls
              playsInline
              /*
                `metadata`, not `none`.

                Opening this IS the request for these bytes — the tile never
                asks for any — so loading the header and first frame here costs
                nothing that was not already intended, and it buys two things:
                a real frame instead of a black rectangle, and a poster
                captured on open rather than only after somebody presses play.
                `none` meant the signed URL sat unused until a click that might
                come after it had expired.

                There is deliberately no `autoPlay`. Chrome blocks autoplay
                with sound, and a blocked autoplay does not merely fail to
                play — the element issues NO network request at all and sits at
                readyState 0 forever with no error to react to. The clip looked
                like a black rectangle that was loading and never would. It is
                also the better behaviour: opening a file in an archive should
                not start playing audio at whoever opened it.
              */
              preload="metadata"
              className="aspect-video w-full"
              // Both of these are about to pull bytes over a URL that may
              // have gone stale while the modal sat open.
              onPlay={refreshIfStale}
              onSeeking={refreshIfStale}
              /*
                A signed URL that expires before ANY data arrives does not
                raise `error` — Chrome leaves the element in networkState
                LOADING at readyState 0 and waits forever. So a stall with
                nothing decoded is treated as the expiry it almost always is.
              */
              onStalled={(event) => {
                if (event.currentTarget.readyState !== 0) return;
                if (retries.current >= 2) return;
                retries.current += 1;
                void sign();
              }}
              onLoadedData={(event) => {
                retries.current = 0;
                if (resumeAt.current) {
                  event.currentTarget.currentTime = resumeAt.current;
                  resumeAt.current = 0;
                }
                store(event.currentTarget);
              }}
              // A paused frame is a frame somebody chose. It makes a better
              // poster than frame zero, which is black more often than not.
              onPause={(event) => store(event.currentTarget)}
              onError={(event) => {
                const node = event.currentTarget;
                const code = node.error?.code;
                /*
                  First, rule out the CORS request itself.

                  A bucket with no CORS rule refuses the anonymous load, and it
                  looks exactly like an unsupported source — so this cannot be
                  told apart from a codec verdict by the error code. Drop the
                  attribute and let the element try again: if it was CORS the
                  clip now plays (without a poster), and if it was the codec the
                  next error says so for real.
                */
                if (anonymous) {
                  corsReadable = false;
                  resumeAt.current = node.currentTime;
                  setAnonymous(false);
                  return;
                }
                // 4 = SRC_NOT_SUPPORTED: the browser looked and refused. That
                // is an answer about the codec, and re-signing cannot change
                // it.
                if (code === 4)
                  return setFailed({ id: asset.id, kind: "codec" });
                // Anything else on a URL this short-lived is almost always the
                // signature having expired mid-playback.
                if (retries.current >= 2)
                  return setFailed({ id: asset.id, kind: "network" });
                retries.current += 1;
                resumeAt.current = node.currentTime;
                void sign();
              }}
            />
          )}
        </div>

        {failure === "network" && (
          <p role="alert" className="text-sm leading-6">
            {c(
              "재생이 중단되었습니다. 다시 열거나 원본을 내려받아 확인하세요.",
              "Playback stopped. Open it again, or download the original.",
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 text-sm text-muted tabular-nums">
            <span className="break-all">{asset.name}</span>
            {" · "}
            {bytes(asset.size)}
            {" · "}
            {new Date(asset.createdAt).toLocaleDateString(lang)}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              className={secondaryClass}
              disabled={index === 0}
              aria-label={c("이전 파일", "Previous file")}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
            <span className="text-xs text-muted tabular-nums">
              {index + 1} / {assets.length}
            </span>
            <button
              className={secondaryClass}
              disabled={index === assets.length - 1}
              aria-label={c("다음 파일", "Next file")}
              onClick={() => step(1)}
            >
              <ChevronRight size={16} strokeWidth={1.5} />
            </button>
            <button className={secondaryClass} onClick={() => onDownload(asset)}>
              <Download size={16} strokeWidth={1.5} />
              {c("다운로드", "Download")}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
