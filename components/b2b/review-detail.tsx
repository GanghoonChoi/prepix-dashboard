"use client";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref, type RefObject } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  Maximize,
  Pause,
  Play,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { assertExactReviewEntry, checkExactReviewTarget, parseExactReviewTarget, type ExactReviewTarget } from "@/lib/b2b-reviews/exact-target";
import { homeEnvironment } from "@/lib/b2b-home/home";
import { useI18n } from "@/lib/i18n/context";
import type {
  ReviewApprovalState,
  ReviewComment,
  ReviewDetail,
  ReviewShare,
} from "@/lib/api/generated/b2b";
import {
  NO_REVIEW,
  origin,
  reviewEvents,
  reviewStore,
  reviewsService,
  shareToken,
} from "@/lib/api/services/b2b-reviews.service";
import { userService } from "@/lib/api/services/user.service";
import { fileApi, fileError } from "@/lib/b2b-files/api";
import { audienceInput, detailAudience, type ReviewRecord, type ReviewScope } from "@/lib/b2b-reviews/operations";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { accessEnded, errorCode, useCopy } from "./shared";
import {
  approvalCopy,
  kst,
  previewCopy,
  ReviewError,
  ReviewAudiencePicker,
  type AudienceSelection,
  timecode,
  useLoader,
  useRun,
  useTeamScope,
  VideoVersionPicker,
} from "./reviews";
import { ReviewPending } from "./review-pending";

// SOT: prepix-backend backend/docs/b2b-reviews.md (S14/S15)
//
// Laid out like Frame.io (2026-10-07): the video and its timeline on the left,
// the feedback beside it, the lead's tools under the video. Keyboard first —
// Space/K play, J/L ±5s, ←/→ ±1s, I/O mark a range, C to comment.
type Copy = (ko: string, en: string) => string;
const RENEW_BEFORE_MS = 30_000;
const card = "rounded-lg border border-border bg-background";
const textButton = "text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50";

/** 0:12, 1:02:03 — the compact clock shown on screen. Accessible names keep
 * the exact `timecode()`. */
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
};
const span = (m: { startMs: number; endMs: number | null }) =>
  `${timecode(m.startMs)}${m.endMs !== null ? ` – ${timecode(m.endMs)}` : ""}`;

export function ProjectReviewView({ projectId, reviewId }: { projectId: string; reviewId: string }) {
  const query = useSearchParams();
  const target = useMemo(() => {
    try { return { value: parseExactReviewTarget(query), error: "" }; }
    catch (e) { return { value: undefined, error: errorCode(e) }; }
  }, [query]);
  const { team, me, permitted } = useTeamScope();
  const scope = useMemo<ReviewScope>(
    () => ({ origin: origin(), userId: me, kind: "project", workspaceId: team, projectId, reviewId }),
    [team, me, projectId, reviewId],
  );
  if (!permitted || !me) return <ReviewError code="B2B_REVIEW_NOT_FOUND" />;
  if (target.error) return <ReviewError code={target.error} />;
  return (
    <ReviewScreen
      key={JSON.stringify([scope, target.value])}
      scope={scope}
      exactTarget={target.value}
      back={`/dashboard/workspaces/${team}/projects/${projectId}/reviews`}
    />
  );
}

/** Restricted share entry. The token arrives in the URL fragment (never sent
 * to a server), is kept for this tab only and sent as a header. */
export function SharedReview({ shareId }: { shareId: string }) {
  const c = useCopy();
  const [state, setState] = useState<{ token: string | null; me: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (fromHash && /^[0-9a-f]{64}$/.test(fromHash)) {
      shareToken.write(shareId, fromHash);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = shareToken.read(shareId);
    userService
      .getProfile()
      .then((p) => setState({ token, me: p.id ?? "" }))
      .catch((e) => setError(errorCode(e)));
  }, [shareId]);
  const [reviewId, setReviewId] = useState(NO_REVIEW);
  if (error) return <ReviewError code={error} />;
  if (!state) return <TeamLoading />;
  if (!state.token) return <ReviewError code="B2B_REVIEW_NOT_FOUND" />;
  const scope: ReviewScope = { origin: origin(), userId: state.me, kind: "share", shareId, reviewId };
  return (
    <ReviewScreen
      key={JSON.stringify(scope)}
      scope={scope}
      token={state.token}
      onReview={(id) => id !== reviewId && setReviewId(id)}
      notice={c(
        "공유받은 검토만 볼 수 있습니다. 이 링크로 폴더의 다른 자료·요청·검토에는 들어갈 수 없습니다.",
        "You can see only this shared review. This link does not open the folder's other files, requests or reviews.",
      )}
    />
  );
}

type ComposerHandle = { markIn(): void; markOut(): void; focus(): void };

function ReviewScreen({
  scope,
  token,
  back,
  notice,
  onReview,
  exactTarget,
}: {
  scope: ReviewScope;
  token?: string | null;
  back?: string;
  notice?: string;
  onReview?: (id: string) => void;
  exactTarget?: ExactReviewTarget;
}) {
  const c = useCopy();
  const [round, setRound] = useState<number | undefined>(exactTarget?.round);
  const [pending, setPending] = useState<ReviewRecord[]>([]);
  const [pendingError, setPendingError] = useState("");
  const read = useCallback(async () => {
    const checkEntry = () => {
      if (exactTarget && scope.kind === "project")
        assertExactReviewEntry(scope, exactTarget, homeEnvironment(origin()), window.location.search);
    };
    checkEntry();
    const detail = await reviewsService.detail(scope, round, token);
    checkEntry();
    if (exactTarget) checkExactReviewTarget(detail, scope.reviewId, exactTarget);
    // An unreadable device store is an error, never "nothing pending".
    try {
      const records = await reviewStore.list(scope);
      checkEntry();
      setPending(records);
      setPendingError("");
    } catch (e) {
      setPendingError(errorCode(e));
    }
    checkEntry();
    return detail;
  }, [scope, round, token, exactTarget]);
  const { data, error, stale, load } = useLoader(read);
  useEffect(() => {
    if (data) onReview?.(data.review.id);
  }, [data, onReview]);

  const video = useRef<HTMLVideoElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const now = useRef(0);
  const [time, setTime] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const seek = useCallback((ms: number, commentId?: string) => {
    // Paused on the frame the feedback is about, not playing past it.
    const v = video.current;
    if (v) {
      v.pause();
      v.currentTime = ms / 1000;
    }
    now.current = ms;
    setTime(ms);
    if (commentId) setFocused(commentId);
  }, []);
  useReviewKeys(video, composer);

  if (!data)
    return error ? (
      <ReviewError code={error} retry={() => void load()} />
    ) : (
      <TeamLoading />
    );
  const selected = data.rounds.find((r) => r.round === data.selectedRound)!;
  const current = data.selectedRound === data.review.round;
  const top = data.comments.filter((m) => !m.parentId);
  const unnamed = c("이름 없음", "Unnamed");
  return (
    <div className="space-y-4 text-foreground">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1">
          {back && (
            <Link href={back} className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-foreground">
              <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
              {c("검토 목록", "Reviews")}
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight">{data.review.title}</h1>
            <StatusPill state={data.approval} c={c} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
            <span>{`V${selected.ordinal} · ${c("회차", "Round")} ${selected.round}${current ? "" : ` · ${c("이전 검토(읽기 전용)", "Previous round (read-only)")}`}`}</span>
            {data.approver && (
              <span>
                {c("승인자", "Approver")} {data.approver.person.name ?? unnamed}
                {data.approver.person.userId === data.currentUserId && c(" (나)", " (you)")}
              </span>
            )}
            {data.audience && (
              <span>{c("현재 검토 대상", "Current review audience")}: {data.review.audienceScope === "project"
                ? c("폴더 내부 전체 공개", "Everyone internal on the folder") + (data.audience.length ? c(" · 외부 ", " · external ") + data.audience.map((p) => p.name ?? unnamed).join(", ") : "")
                : data.audience.map((p) => p.name ?? unnamed).join(", ")}</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.rounds.length > 1 && (
            <nav className="inline-flex flex-wrap rounded-md border border-border p-0.5" aria-label={c("검토 회차", "Review rounds")}>
              {data.rounds.map((r) => (
                <button
                  key={r.round}
                  type="button"
                  aria-pressed={r.round === data.selectedRound}
                  disabled={!!exactTarget && r.round !== exactTarget.round}
                  className="rounded px-2.5 py-1 text-xs transition-colors hover:text-foreground disabled:opacity-40 aria-pressed:bg-foreground aria-pressed:text-background text-muted"
                  onClick={() => setRound(r.round)}
                >
                  V{r.ordinal} · {r.current ? c("현재 검토", "Current") : c("이전 검토", "Previous")}
                </button>
              ))}
            </nav>
          )}
          {scope.kind === "project" && <VersionDownload key={selected.versionId} scope={scope} versionId={selected.versionId} />}
          {scope.kind === "share" && data.allowedActions.download && <SharedDownload scope={scope} token={token ?? null} />}
        </div>
      </header>
      {(notice || exactTarget || !data.review.audienceConfirmed || selected.changeReason) && (
        <div className="space-y-1 text-[13px] text-muted">
          {notice && <p>{notice}</p>}
          {exactTarget && <p>{c("앱에서 선택한 영상 버전의 검토입니다.", "Review of the video version selected in the app.")}</p>}
          {!data.review.audienceConfirmed && <p role="status">{c("검토 대상·승인자 확정 전입니다. 담당자가 대상을 확정하면 새 검토 회차가 시작됩니다.", "The audience and approver are unconfirmed. Confirming them opens a new review round.")}</p>}
          {selected.changeReason && <p>{c("회차 변경 사유", "Round-change reason")}: {selected.changeReason}</p>}
        </div>
      )}
      {scope.reviewId !== NO_REVIEW && <ReviewPending scope={scope} token={token} currentRound={data.review.round} onConfirmed={() => void load()} />}
      {stale && <ReviewError code={error} retry={() => void load()} />}
      {pendingError && <ReviewError code={pendingError} retry={() => void load()} />}

      {/* Three cells, so a phone reads video → feedback → tools, while a
          desktop keeps the feedback beside the video for the whole page. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
        <div className="min-w-0">
          <ReviewPlayer
            key={`${scope.reviewId}:${data.selectedRound}`}
            scope={scope}
            token={token}
            detail={data}
            video={video}
            markers={top}
            onTime={(ms) => {
              now.current = ms;
              setTime(ms);
            }}
            onMarker={(m) => seek(m.startMs, m.id)}
          />
        </div>
        <aside className={`${card} flex min-w-0 flex-col overflow-hidden lg:sticky lg:top-16 lg:row-span-2 lg:max-h-[calc(100dvh-5.5rem)]`}>
          <Approval scope={scope} token={token} detail={data} reload={load} />
          <Comments
            scope={scope}
            token={token}
            detail={data}
            pending={pending}
            now={now}
            time={time}
            focused={focused}
            composer={composer}
            pause={() => video.current?.pause()}
            onSeek={seek}
            reload={load}
          />
        </aside>
        {/* P (2026-10-07): the publisher of this item shares it outside the team too (allowedActions.share). */}
        {!exactTarget && scope.kind === "project" && (data.allowedActions.setAudience || data.allowedActions.setApprover || data.allowedActions.replaceVersion || data.allowedActions.share) && (
          <div className="min-w-0 pt-2 lg:col-start-1">
            <LeadTools scope={scope} detail={data} reload={load} />
          </div>
        )}
      </div>
    </div>
  );
}

const statusTone: Record<ReviewApprovalState, string> = {
  approved: "bg-emerald-500",
  changes_requested: "bg-amber-500",
  awaiting: "bg-sky-500",
  no_approver: "bg-muted",
  approver_inactive: "bg-red-500",
};
function StatusPill({ state, c }: { state: ReviewApprovalState; c: Copy }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs">
      <span className={`size-1.5 rounded-full ${statusTone[state]}`} aria-hidden="true" />
      {c(...approvalCopy[state])}
    </span>
  );
}

/** Player shortcuts, ignored while typing (a range slider is not typing). */
function useReviewKeys(video: RefObject<HTMLVideoElement | null>, composer: RefObject<ComposerHandle | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      const typing =
        t.isContentEditable ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "range");
      if (typing || document.querySelector("dialog[open]")) return;
      const v = video.current;
      if (!v) return;
      const step = (s: number) => {
        v.currentTime = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : Infinity, v.currentTime + s));
      };
      switch (e.key.toLowerCase()) {
        case " ":
          // Space on a focused button is that button's click.
          if (t.tagName === "BUTTON" || t.tagName === "A") return;
          e.preventDefault();
          if (v.paused) void v.play().catch(() => {});
          else v.pause();
          return;
        case "k":
          if (v.paused) void v.play().catch(() => {});
          else v.pause();
          return;
        case "j":
          return step(-5);
        case "l":
          return step(5);
        case "arrowleft":
          e.preventDefault();
          return step(e.shiftKey ? -5 : -1);
        case "arrowright":
          e.preventDefault();
          return step(e.shiftKey ? 5 : 1);
        case "i":
          return composer.current?.markIn();
        case "o":
          return composer.current?.markOut();
        case "c":
          e.preventDefault();
          return composer.current?.focus();
        case "m":
          v.muted = !v.muted;
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [video, composer]);
}

/** Playback URLs live at most 5 minutes. Each renewal rechecks access; a
 * revoked viewer gets no new URL and playback stops at the old URL's end. */
function ReviewPlayer({
  scope,
  token,
  detail,
  video,
  markers,
  onTime,
  onMarker,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  video: RefObject<HTMLVideoElement | null>;
  markers: ReviewComment[];
  onTime: (ms: number) => void;
  onMarker: (m: ReviewComment) => void;
}) {
  const c = useCopy();
  const stage = useRef<HTMLDivElement>(null);
  const resume = useRef<{ at: number; playing: boolean } | null>(null);
  const [source, setSource] = useState<{ url: string; expiresAt: number } | null>(null);
  const [ended, setEnded] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [pos, setPos] = useState(0);
  const [length, setLength] = useState(detail.preview.durationMs ?? 0);
  const ready = detail.preview.state === "ready";
  const issue = useCallback(
    async (keepPosition: boolean) => {
      try {
        const p = await reviewsService.playback(scope, detail.selectedRound, token);
        const v = video.current;
        if (keepPosition && v) resume.current = { at: v.currentTime, playing: !v.paused };
        setSource({ url: p.url, expiresAt: Date.parse(p.expiresAt) });
        setError("");
      } catch (e) {
        if (accessEnded(e)) {
          video.current?.pause();
          setSource(null);
          setEnded(errorCode(e));
        } else setError(errorCode(e));
      }
    },
    [scope, token, detail.selectedRound, video],
  );
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => void issue(false), 0);
    return () => clearTimeout(t);
  }, [ready, issue]);
  useEffect(() => {
    if (!source) return;
    const wait = Math.max(1000, source.expiresAt - Date.now() - RENEW_BEFORE_MS);
    const t = window.setTimeout(() => void issue(true), wait);
    return () => clearTimeout(t);
  }, [source, issue]);
  if (!ready)
    return (
      <div className="grid aspect-video place-items-center rounded-lg bg-black p-6 text-center text-sm text-white/80" aria-live="polite">
        <div className="space-y-3">
          <p>{previewCopy(detail.preview, c)}</p>
          {detail.preview.state === "failed" && detail.preview.failureCode && (
            <p className="text-white/50">{detail.preview.failureCode}</p>
          )}
          {detail.allowedActions.retryPreview && scope.kind === "project" && (
            <button
              type="button"
              className={secondaryClass}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await reviewsService.preparePreview(scope, detail.preview.versionId);
                  window.dispatchEvent(new CustomEvent(reviewEvents, { detail: scope }));
                } catch (e) {
                  setError(errorCode(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c("검토본 다시 만들기", "Retry review copy")}
            </button>
          )}
          {error && <ReviewError code={error} />}
        </div>
      </div>
    );
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  };
  const pct = (ms: number) => (length ? Math.min(100, (ms / length) * 100) : 0);
  const icon = "grid size-8 place-items-center rounded-md text-white/85 transition-colors hover:bg-white/10 hover:text-white";
  return (
    <div className="space-y-2">
      {ended ? (
        <ReviewError code={ended} />
      ) : (
        <div
          ref={stage}
          className="flex flex-col overflow-hidden rounded-lg bg-black text-white [&:fullscreen]:rounded-none [&:fullscreen_video]:aspect-auto [&:fullscreen_video]:min-h-0 [&:fullscreen_video]:flex-1"
        >
          <video
            ref={video}
            className="aspect-video w-full cursor-pointer bg-black"
            playsInline
            preload="metadata"
            src={source?.url}
            aria-label={c("검토 영상", "Review video")}
            onClick={toggle}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
            onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
            onTimeUpdate={(e) => {
              const ms = Math.round(e.currentTarget.currentTime * 1000);
              setPos(ms);
              onTime(ms);
            }}
            onSeeked={(e) => {
              const ms = Math.round(e.currentTarget.currentTime * 1000);
              setPos(ms);
              onTime(ms);
            }}
            onLoadedMetadata={(e) => {
              if (Number.isFinite(e.currentTarget.duration))
                setLength(Math.round(e.currentTarget.duration * 1000));
              const r = resume.current;
              resume.current = null;
              if (r) {
                e.currentTarget.currentTime = r.at;
                if (r.playing) void e.currentTarget.play().catch(() => {});
              }
            }}
            onError={() => {
              // An expired URL mid-play: renew with current access and continue.
              if (source && Date.now() >= source.expiresAt - RENEW_BEFORE_MS) void issue(true);
            }}
          />
          <div className="px-3 pb-1.5 pt-2">
            {/* Timeline: comment ranges on the track, a dot per comment under it. */}
            <div className="relative h-4">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20">
                {markers.map((m) =>
                  m.endMs !== null ? (
                    <div
                      key={m.id}
                      className="absolute inset-y-0 bg-amber-400/60"
                      style={{ left: `${pct(m.startMs)}%`, width: `${Math.max(0.5, pct(m.endMs) - pct(m.startMs))}%` }}
                    />
                  ) : null,
                )}
                <div className="relative h-full bg-white" style={{ width: `${pct(pos)}%` }} />
              </div>
              <div
                className="pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: `${pct(pos)}%` }}
              />
              <input
                type="range"
                min={0}
                max={length || 0}
                step={10}
                value={Math.min(pos, length)}
                onChange={(e) => {
                  const v = video.current;
                  if (v) v.currentTime = Number(e.target.value) / 1000;
                }}
                aria-label={c("재생 위치", "Playback position")}
                aria-valuetext={clock(pos)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            {markers.length > 0 && (
              <div className="relative h-3" role="group" aria-label={c("코멘트 위치", "Comment positions")}>
                {markers.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={`${clock(m.startMs)} ${m.author.name ?? ""}: ${m.body}`}
                    aria-label={`${c("코멘트 위치로 이동", "Go to comment")} ${timecode(m.startMs)}`}
                    className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full transition-transform hover:scale-150 ${m.resolved ? "bg-white/35" : "bg-amber-400"}`}
                    style={{ left: `${pct(m.startMs)}%` }}
                    onClick={() => onMarker(m)}
                  />
                ))}
              </div>
            )}
            <div className="flex items-center gap-1">
              <button type="button" className={icon} onClick={toggle} aria-label={playing ? c("일시정지", "Pause") : c("재생", "Play")}>
                {playing ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
              </button>
              <span className="px-1 font-mono text-xs tabular-nums text-white/75">
                {clock(pos)} <span className="text-white/40">/ {clock(length)}</span>
              </span>
              <span className="flex-1" />
              <button
                type="button"
                className={`${icon} w-auto px-2 font-mono text-xs`}
                aria-label={c(`재생 속도 ${rate}배`, `Playback speed ${rate}x`)}
                onClick={() => {
                  const v = video.current;
                  if (!v) return;
                  const speeds = [1, 1.5, 2, 0.5];
                  v.playbackRate = speeds[(speeds.indexOf(v.playbackRate) + 1) % speeds.length];
                }}
              >
                {rate}x
              </button>
              <button
                type="button"
                className={icon}
                aria-label={muted ? c("소리 켜기", "Unmute") : c("음소거", "Mute")}
                onClick={() => {
                  const v = video.current;
                  if (v) v.muted = !v.muted;
                }}
              >
                {muted ? <VolumeX size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className={icon}
                aria-label={c("전체 화면", "Full screen")}
                onClick={() => {
                  if (document.fullscreenElement) void document.exitFullscreen();
                  else void stage.current?.requestFullscreen?.().catch(() => {});
                }}
              >
                <Maximize size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <ReviewError code={error} retry={() => void issue(true)} />}
      <p className="text-xs leading-5 text-muted">
        {c(
          "Space 재생 · J/L 5초 · ←/→ 1초 · I/O 구간 · C 코멘트. 재생 주소는 최대 5분 동안 유효하며 만료 전에 현재 권한으로 다시 받아 이어서 재생합니다. 공유 회수나 참여 종료 뒤에는 새 주소가 발급되지 않지만, 이미 발급된 주소는 만료 시각(최대 5분)까지 남을 수 있습니다.",
          "Space play · J/L 5s · ←/→ 1s · I/O range · C comment. Playback URLs last at most 5 minutes and are renewed with your current access. After a revoked share or ended participation no new URL is issued, but an already issued URL can remain usable until it expires (up to 5 minutes).",
        )}
      </p>
    </div>
  );
}

function Avatar({ name }: { name: string | null }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-tertiary text-[11px] font-semibold uppercase" aria-hidden="true">
      {(name ?? "?").slice(0, 1)}
    </span>
  );
}

function useAgo() {
  const { lang } = useI18n();
  return (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { numeric: "auto" });
    if (minutes < 1) return rtf.format(0, "minute");
    if (minutes < 60) return rtf.format(-minutes, "minute");
    if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), "hour");
    if (minutes < 10080) return rtf.format(-Math.round(minutes / 1440), "day");
    return kst(iso);
  };
}

/** Feedback as a spreadsheet: one row per comment and reply, in time order. */
function exportComments(detail: ReviewDetail, c: Copy) {
  const ordinal = detail.rounds.find((r) => r.round === detail.selectedRound)?.ordinal;
  const rows: string[][] = [[c("시작", "Start"), c("끝", "End"), c("작성자", "Author"), c("내용", "Comment"), c("구분", "Kind"), c("완료", "Done"), c("작성 시각", "Created")]];
  for (const m of detail.comments.filter((x) => !x.parentId))
    for (const x of [m, ...detail.comments.filter((r) => r.parentId === m.id)])
      rows.push([
        timecode(x.startMs),
        x.endMs !== null ? timecode(x.endMs) : "",
        x.author.name ?? "",
        x.body,
        x.parentId ? c("답글", "Reply") : c("코멘트", "Comment"),
        !x.parentId && m.resolved ? "✓" : "",
        kst(x.createdAt),
      ]);
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${detail.review.title.replace(/[\\/:*?"<>|]/g, "_")}-V${ordinal}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Comments({
  scope,
  token,
  detail,
  pending,
  now,
  time,
  focused,
  composer,
  pause,
  onSeek,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  pending: ReviewRecord[];
  now: RefObject<number>;
  time: number;
  focused: string | null;
  composer: Ref<ComposerHandle>;
  pause: () => void;
  onSeek: (ms: number, commentId?: string) => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const [filter, setFilter] = useState<"all" | "open">("all");
  const sending = pending.filter((r) => r.action === "comment" && r.input.round === detail.selectedRound);
  const top = detail.comments.filter((m) => !m.parentId);
  const open = top.filter((m) => !m.resolved).length;
  const shown = filter === "open" ? top.filter((m) => !m.resolved) : top;
  return (
    <section className="flex min-h-0 flex-1 flex-col" aria-label={c("코멘트", "Comments")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-medium">
          {c("코멘트", "Comments")} <span className="tabular-nums text-muted">{top.length}</span>
        </h2>
        <div className="flex items-center gap-1">
          <div className="inline-flex rounded-md border border-border p-0.5 text-xs" role="group" aria-label={c("코멘트 보기", "Comment filter")}>
            {(
              [
                ["all", c("전체", "All")],
                ["open", `${c("남은 것", "Open")} ${open}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className="rounded px-2 py-0.5 text-muted transition-colors hover:text-foreground aria-pressed:bg-surface-tertiary aria-pressed:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
          {top.length > 0 && (
            <button
              type="button"
              onClick={() => exportComments(detail, c)}
              title={c("CSV로 내보내기", "Export as CSV")}
              aria-label={c("코멘트 CSV로 내보내기", "Export comments as CSV")}
              className="grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-secondary hover:text-foreground"
            >
              <Download size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sending.map((r) => (
          <article key={r.input.requestKey} className="border-b border-dashed border-border px-4 py-3 text-[13px]" aria-live="polite">
            <p className="text-xs text-muted">
              {timecode(r.input.startMs as number)} · {c("전송 확인 대기 — 아직 공개되지 않았습니다", "Awaiting confirmation — not published yet")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{r.input.body as string}</p>
          </article>
        ))}
        {shown.length === 0 && !sending.length ? (
          <p className="px-6 py-10 text-center text-[13px] text-muted">
            {top.length ? c("남은 코멘트가 없습니다.", "Nothing left open.") : c("이 회차에 코멘트가 없습니다.", "No comments in this round.")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((m) => (
              <CommentItem
                key={m.id}
                scope={scope}
                token={token}
                detail={detail}
                comment={m}
                replies={detail.comments.filter((r) => r.parentId === m.id)}
                active={time >= m.startMs && time <= (m.endMs ?? m.startMs) + 1500}
                focused={focused === m.id}
                onSeek={onSeek}
                reload={reload}
              />
            ))}
          </ul>
        )}
      </div>
      {detail.allowedActions.comment && (
        <Composer ref={composer} scope={scope} token={token} detail={detail} now={now} time={time} pause={pause} reload={reload} />
      )}
    </section>
  );
}

/** Unsent text is a per-account/service/review/round draft on this device;
 * it never shows as a published comment. Until a time is set (I, the start
 * button, or starting to type) the comment follows the playhead. */
function Composer({
  ref,
  scope,
  token,
  detail,
  now,
  time,
  pause,
  reload,
}: {
  ref: Ref<ComposerHandle>;
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  now: RefObject<number>;
  time: number;
  pause: () => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const round = detail.selectedRound;
  const [body, setBody] = useState("");
  const [startMs, setStart] = useState(0);
  const [endMs, setEnd] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draftError, setDraftError] = useState("");
  const mutation = useRun();
  const typed = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const duration = detail.preview.durationMs ?? 0;
  const at = () => Math.min(now.current, Math.max(0, duration - 1));
  const markIn = () => {
    const s = at();
    setStart(s);
    setPinned(true);
    if (endMs !== null && endMs <= s) setEnd(null);
  };
  const markOut = () => {
    const s = pinned ? startMs : at();
    if (now.current > s) {
      setStart(s);
      setPinned(true);
      setEnd(Math.min(now.current, duration));
    }
  };
  useImperativeHandle(ref, () => ({
    markIn,
    markOut,
    focus: () => field.current?.focus(),
  }));
  useEffect(() => {
    typed.current = !!body;
  }, [body]);
  useEffect(() => {
    let live = true;
    const read = () =>
      reviewStore
        .draft(scope, round)
        .then((d) => {
          if (!live) return;
          // A discarded pending comment returns here, but never over text
          // the user is typing.
          if (d && !typed.current) {
            setBody(d.body);
            setStart(d.startMs);
            setEnd(d.endMs);
            setPinned(true);
          }
          setLoaded(true);
        })
        .catch((e) => {
          if (!live) return;
          setDraftError(errorCode(e));
          setLoaded(true);
        });
    void read();
    window.addEventListener(reviewEvents, read);
    return () => {
      live = false;
      window.removeEventListener(reviewEvents, read);
    };
  }, [scope, round]);
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => {
      void reviewStore
        .saveDraft(scope, round, body || endMs !== null || (pinned && startMs) ? { body, startMs, endMs } : null)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [scope, round, body, startMs, endMs, pinned, loaded]);
  const shownStart = pinned ? startMs : Math.min(time, Math.max(0, duration - 1));
  const submit = async () => {
    const start = pinned ? startMs : at();
    const input = { round, versionId: detail.review.versionId, startMs: start, endMs, body };
    const done = await mutation.run(input, (requestKey) =>
      reviewsService.mutate(scope, "comment", { requestKey, ...input }, undefined, token),
    );
    // Confirmed, or kept as an unconfirmed record that now carries the
    // original input: either way the text leaves the composer, so it is
    // never sent again under a new key. A definitive rejection keeps it.
    const unconfirmed = (await reviewStore.list(scope).catch(() => [])).some(
      (r) => r.action === "comment" && r.input.body === body && r.input.startMs === start,
    );
    if (done || unconfirmed) {
      setBody("");
      setEnd(null);
      setPinned(false);
      await reviewStore.saveDraft(scope, round, null).catch(() => {});
    }
    await reload();
  };
  const chip = "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted transition-colors hover:bg-surface-secondary hover:text-foreground";
  return (
    <form
      className="shrink-0 space-y-2 border-t border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-amber-700 dark:text-amber-300">
          {clock(shownStart)}
          {endMs !== null && ` – ${clock(endMs)}`}
        </span>
        <button type="button" className={chip} onClick={markIn} aria-label={c("현재 위치를 시작으로", "Start at playhead")} title="I">
          {c("시작점", "In")}
        </button>
        <button type="button" className={chip} onClick={markOut} aria-label={c("현재 위치를 끝으로", "End at playhead")} title="O">
          {c("끝점", "Out")}
        </button>
        {endMs !== null && (
          <button type="button" className={chip} onClick={() => setEnd(null)} aria-label={c("구간 해제", "Clear range")}>
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>
      <textarea
        ref={field}
        className={`${inputClass} min-h-16 resize-none text-[13px]`}
        value={body}
        maxLength={2000}
        rows={2}
        disabled={mutation.busy}
        aria-label={c("코멘트 내용", "Comment text")}
        placeholder={c("이 장면에 대한 의견을 남겨 주세요", "Leave feedback on this moment")}
        onFocus={() => {
          // Typing pins the comment to the frame on screen, and holds it there.
          pause();
          if (!pinned) {
            setStart(at());
            setPinned(true);
          }
        }}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !mutation.busy) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      {draftError && <ReviewError code={draftError} />}
      {mutation.error && <ReviewError code={mutation.error} />}
      <div className="flex items-center justify-between gap-2">
        <span className="hidden text-[11px] text-muted sm:inline">{c("⌘↵ 보내기 · 초안은 이 기기에만 저장", "⌘↵ to send · drafts stay on this device")}</span>
        <span className="sm:hidden" />
        <button type="submit" className={primaryClass} disabled={mutation.busy || !body.trim()}>
          {mutation.busy ? c("전송 중", "Sending") : c("코멘트 남기기", "Post comment")}
        </button>
      </div>
    </form>
  );
}

function CommentItem({
  scope,
  token,
  detail,
  comment: m,
  replies,
  active,
  focused,
  onSeek,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  comment: ReviewComment;
  replies: ReviewComment[];
  active: boolean;
  focused: boolean;
  onSeek: (ms: number, commentId?: string) => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const ago = useAgo();
  const [mode, setMode] = useState<"" | "edit" | "convert" | "reply">("");
  const [history, setHistory] = useState(false);
  const mutation = useRun();
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const base = scope.kind === "project" ? `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}` : "";
  const canAct = detail.allowedActions.comment;
  const resolve = async () => {
    const input = { resolved: !m.resolved };
    await mutation.run(input, (requestKey) =>
      reviewsService.mutate(scope, "resolve", { requestKey, ...input }, m.id, token),
    );
    await reload();
  };
  return (
    <li
      ref={row}
      className={`group px-4 py-3 transition-colors ${active || focused ? "bg-surface-secondary" : ""} ${m.resolved ? "opacity-60" : ""}`}
    >
      <div className="flex gap-2.5">
        <Avatar name={m.author.name} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="truncate font-medium">{m.author.name ?? c("이름 없음", "Unnamed")}</span>
            <span className="shrink-0 text-muted" title={kst(m.createdAt)}>{ago(m.createdAt)}</span>
            {m.revision > 1 && <span className="shrink-0 text-muted">· {c("수정됨", "Edited")}</span>}
            <span className="flex-1" />
            {canAct ? (
              <button
                type="button"
                onClick={() => void resolve()}
                disabled={mutation.busy}
                aria-pressed={!!m.resolved}
                aria-label={m.resolved ? c("완료 취소", "Reopen") : c("완료로 표시", "Mark done")}
                title={m.resolved ? c("완료 취소", "Reopen") : c("완료로 표시", "Mark done")}
                className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted transition-colors hover:border-foreground hover:text-foreground aria-pressed:border-emerald-500 aria-pressed:bg-emerald-500 aria-pressed:text-white"
              >
                <Check size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            ) : (
              m.resolved && <Check size={14} className="text-emerald-500" aria-label={c("완료", "Done")} />
            )}
          </div>
          <button
            type="button"
            className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-amber-700 transition-colors hover:bg-amber-400/25 dark:text-amber-300"
            aria-label={span(m)}
            onClick={() => onSeek(m.startMs, m.id)}
          >
            {clock(m.startMs)}
            {m.endMs !== null && ` – ${clock(m.endMs)}`}
          </button>
          {mode === "edit" ? (
            <EditForm scope={scope} token={token} comment={m} onDone={() => setMode("")} reload={reload} />
          ) : (
            <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{m.body}</p>
          )}
          {m.resolved && (
            <p className="text-[11px] text-muted">
              {c(`${m.resolved.by.name ?? "이름 없음"} 님이 완료로 표시`, `Marked done by ${m.resolved.by.name ?? "someone"}`)}
            </p>
          )}
          {m.request && (
            <p className="text-xs">
              {c("요청으로 전환됨", "Converted to a request")}
              {m.request.title && (
                <>
                  {" · "}
                  <Link className="underline underline-offset-2" href={`${base}/requests/${m.request.requestId}`}>
                    {m.request.title}
                  </Link>
                  {` · ${m.request.state}`}
                </>
              )}
            </p>
          )}
          {history && (
            <ol className="space-y-1 text-xs text-muted">
              {m.history.map((h) => (
                <li key={h.number}>
                  {h.number}. {kst(h.createdAt)} — <span className="whitespace-pre-wrap">{h.body}</span>
                </li>
              ))}
            </ol>
          )}
          {replies.length > 0 && (
            <ul className="mt-2 space-y-2.5 border-l border-border pl-3">
              {replies.map((r) => (
                <Reply key={r.id} scope={scope} token={token} comment={r} reload={reload} />
              ))}
            </ul>
          )}
          {mode !== "edit" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
              {canAct && mode !== "reply" && (
                <button type="button" className={textButton} onClick={() => setMode("reply")}>
                  {c("답글", "Reply")}
                </button>
              )}
              {m.canEdit && (
                <button type="button" className={textButton} onClick={() => setMode("edit")}>
                  {c("수정", "Edit")}
                </button>
              )}
              {m.canConvert && mode !== "convert" && (
                <button type="button" className={textButton} onClick={() => setMode("convert")}>
                  {c("요청으로 전환", "Convert to request")}
                </button>
              )}
              {m.revision > 1 && (
                <button type="button" className={textButton} onClick={() => setHistory((v) => !v)}>
                  {c("수정 이력", "Edit history")}
                </button>
              )}
            </div>
          )}
          {mode === "reply" && <ReplyForm scope={scope} token={token} detail={detail} parent={m} onDone={() => setMode("")} reload={reload} />}
          {mode === "convert" && <ConvertForm scope={scope} comment={m} base={base} onDone={() => setMode("")} reload={reload} />}
          {mutation.error && <ReviewError code={mutation.error} />}
        </div>
      </div>
    </li>
  );
}

function Reply({ scope, token, comment: r, reload }: { scope: ReviewScope; token?: string | null; comment: ReviewComment; reload: () => Promise<void> }) {
  const c = useCopy();
  const ago = useAgo();
  const [editing, setEditing] = useState(false);
  return (
    <li className="space-y-0.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="truncate font-medium">{r.author.name ?? c("이름 없음", "Unnamed")}</span>
        <span className="shrink-0 text-muted" title={kst(r.createdAt)}>{ago(r.createdAt)}</span>
        {r.revision > 1 && <span className="shrink-0 text-muted">· {c("수정됨", "Edited")}</span>}
      </div>
      {editing ? (
        <EditForm scope={scope} token={token} comment={r} onDone={() => setEditing(false)} reload={reload} />
      ) : (
        <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{r.body}</p>
      )}
      {r.canEdit && !editing && (
        <button type="button" className={textButton} onClick={() => setEditing(true)}>
          {c("수정", "Edit")}
        </button>
      )}
    </li>
  );
}

function EditForm({ scope, token, comment: m, onDone, reload }: { scope: ReviewScope; token?: string | null; comment: ReviewComment; onDone: () => void; reload: () => Promise<void> }) {
  const c = useCopy();
  const [body, setBody] = useState(m.body);
  const mutation = useRun();
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = { revision: m.revision, body };
        const done = await mutation.run(input, (requestKey) =>
          reviewsService.mutate(scope, "edit", { requestKey, ...input }, m.id, token),
        );
        if (done) onDone();
        await reload();
      }}
    >
      <textarea className={`${inputClass} min-h-16 text-[13px]`} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} aria-label={c("수정할 내용", "Edited text")} />
      <div className="flex gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.busy || !body.trim()}>
          {c("수정 저장", "Save edit")}
        </button>
        <button type="button" className={secondaryClass} onClick={onDone}>
          {c("취소", "Cancel")}
        </button>
      </div>
      {mutation.error && <ReviewError code={mutation.error} />}
    </form>
  );
}

function ReplyForm({ scope, token, detail, parent, onDone, reload }: { scope: ReviewScope; token?: string | null; detail: ReviewDetail; parent: ReviewComment; onDone: () => void; reload: () => Promise<void> }) {
  const c = useCopy();
  const [body, setBody] = useState("");
  const mutation = useRun();
  const send = async () => {
    // A reply sits at its parent's time; the server enforces the same.
    const input = { round: detail.selectedRound, versionId: detail.review.versionId, startMs: parent.startMs, endMs: parent.endMs, body, parentId: parent.id };
    const done = await mutation.run(input, (requestKey) =>
      reviewsService.mutate(scope, "comment", { requestKey, ...input }, undefined, token),
    );
    if (done) onDone();
    await reload();
  };
  return (
    <form
      className="space-y-2 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <textarea
        autoFocus
        className={`${inputClass} min-h-14 resize-none text-[13px]`}
        value={body}
        maxLength={2000}
        rows={2}
        aria-label={c("답글 내용", "Reply text")}
        placeholder={c("답글 남기기", "Write a reply")}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !mutation.busy) {
            e.preventDefault();
            void send();
          }
          if (e.key === "Escape") onDone();
        }}
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.busy || !body.trim()}>
          {c("답글 남기기", "Reply")}
        </button>
        <button type="button" className={secondaryClass} onClick={onDone}>
          {c("취소", "Cancel")}
        </button>
      </div>
      {mutation.error && <ReviewError code={mutation.error} />}
    </form>
  );
}

function ConvertForm({ scope, comment: m, base, onDone, reload }: { scope: ReviewScope; comment: ReviewComment; base: string; onDone: () => void; reload: () => Promise<void> }) {
  const c = useCopy();
  const [title, setTitle] = useState(m.body.slice(0, 60));
  const mutation = useRun();
  return (
    <form
      className="space-y-2 pt-1"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = { revision: m.revision, title };
        const done = await mutation.run(input, (requestKey) =>
          reviewsService.mutate(scope, "convert", { requestKey, ...input }, m.id),
        );
        if (done) onDone();
        await reload();
      }}
    >
      <p className="text-xs text-muted">
        {c(
          "원래 코멘트는 그대로 남고, 코멘트 원문과 영상 버전·시각이 요청 내용에 기록됩니다. 담당자가 아니면 요청 제안으로 등록됩니다.",
          "The comment stays. Its text, version and time go into the request; non-leads create a proposal.",
        )}
      </p>
      <label className="block space-y-1 text-[13px]">
        <span>{c("요청 제목", "Request title")}</span>
        <input className={inputClass} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="submit" className={primaryClass} disabled={mutation.busy || !title.trim()}>
          {c("요청 만들기", "Create request")}
        </button>
        <button type="button" className={secondaryClass} onClick={onDone}>
          {c("취소", "Cancel")}
        </button>
      </div>
      {mutation.error && <ReviewError code={mutation.error} />}
      {mutation.error === "B2B_REVIEW_COMMENT_CONVERTED" && (
        <p className="text-xs">
          {c(
            "요청이 이미 만들어졌을 수 있습니다. 중복으로 만들기 전에 ",
            "A request may already have been created. Check the ",
          )}
          <Link className="underline" href={`${base}/requests`}>
            {c("요청 목록", "requests list")}
          </Link>
          {c("을 확인하세요.", " before creating another.")}
        </p>
      )}
    </form>
  );
}

function Approval({
  scope,
  token,
  detail,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const [reason, setReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const mutation = useRun();
  const current = detail.decisions.find((d) => d.current);
  const canCancel = !!current && detail.allowedActions.cancelDecision;
  // Nothing to decide and nothing decided: the status pill in the header says it all.
  if (!detail.allowedActions.decide && !canCancel && !detail.decisions.length && detail.approval !== "approver_inactive")
    return null;
  const decide = async (decision: "approved" | "changes_requested") => {
    // Pinned to what this screen shows; a newer version rejects it.
    const input = {
      revision: detail.review.revision,
      round: detail.review.round,
      versionId: detail.review.versionId,
      decision,
      reason,
    };
    const done = await mutation.run(input, (requestKey) =>
      reviewsService.mutate(scope, "decide", { requestKey, ...input }, undefined, token),
    );
    if (done) setReason("");
    await reload();
  };
  return (
    <section className="max-h-[45%] shrink-0 space-y-3 overflow-y-auto border-b border-border p-4 text-[13px]" aria-label={c("영상 승인", "Video approval")}>
      <h2 className="font-medium">{c("영상 승인", "Video approval")}</h2>
      {detail.approval === "approver_inactive" && (
        <p className="text-muted">{c("지정된 승인자의 접근이 끝났습니다. 담당자가 다시 지정해야 합니다.", "The designated approver lost access; the lead must reassign.")}</p>
      )}
      {detail.allowedActions.decide && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs text-muted">{c("사유(수정 요청 시 필수)", "Reason (required for changes)")}</span>
            <textarea className={`${inputClass} min-h-14 resize-none text-[13px]`} rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondaryClass} disabled={mutation.busy || !reason.trim()} onClick={() => void decide("changes_requested")}>
              {c("수정 요청", "Request changes")}
            </button>
            <button type="button" className={primaryClass} disabled={mutation.busy} onClick={() => void decide("approved")}>
              {c("승인", "Approve")}
            </button>
          </div>
        </div>
      )}
      {canCancel && (
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = { revision: detail.review.revision, reason: cancelReason };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "cancel", { requestKey, ...input }, current!.id, token),
            );
            if (done) setCancelReason("");
            await reload();
          }}
        >
          <label className="block min-w-0 flex-1 space-y-1">
            <span className="text-xs text-muted">{c("결정 취소 사유", "Reason to cancel the decision")}</span>
            <input className={inputClass} value={cancelReason} maxLength={1000} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
          <button type="submit" className={secondaryClass} disabled={mutation.busy || !cancelReason.trim()}>
            {c("결정 취소", "Cancel decision")}
          </button>
        </form>
      )}
      {mutation.error && <ReviewError code={mutation.error} retry={() => void reload()} />}
      {detail.decisions.length > 0 && (
        <ol className="space-y-1.5 text-xs">
          {detail.decisions.map((d) => (
            <li key={d.id} className={d.current ? "" : "text-muted"}>
              {d.decision === "approved" ? c("승인", "Approved") : c("수정 요청", "Changes requested")} ·{" "}
              {d.approver.name ?? c("이름 없음", "Unnamed")} · {kst(d.decidedAt)}
              {d.reason && ` · ${d.reason}`}
              {d.cancelled && ` · ${c("취소됨", "Cancelled")}: ${d.cancelled.reason}`}
              {!d.current && !d.cancelled && ` · ${c("현재 결정 아님", "Not current")}`}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** P (2026-10-07): teammates download what was published into the folder —
 * the exact version this round plays, through the folder's files download
 * (short-lived attachment URL). Shown only when the files API says this
 * account may download it. */
function VersionDownload({ scope, versionId }: { scope: ReviewScope & { kind: "project" }; versionId: string }) {
  const c = useCopy();
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fileApi(scope)
      .version(versionId)
      .then(({ version }) => live && setAllowed(version.allowedActions.download))
      .catch(() => live && setAllowed(false));
    return () => {
      live = false;
    };
  }, [scope, versionId]);
  if (!allowed) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        className={secondaryClass}
        onClick={async () => {
          setError("");
          try {
            window.location.assign((await fileApi(scope).download(versionId)).url);
          } catch (e) {
            setError(fileError(e));
          }
        }}
      >
        <Download size={14} strokeWidth={1.75} aria-hidden="true" />
        {c("이 버전 받기", "Download this version")}
      </button>
      {error && <ReviewError code={error} />}
    </div>
  );
}

function SharedDownload({ scope, token }: { scope: ReviewScope; token: string | null }) {
  const c = useCopy();
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ size: number; sha256: string } | null>(null);
  return (
    <div className="space-y-2 text-sm">
      <button
        type="button"
        className={secondaryClass}
        onClick={async () => {
          try {
            const d = await reviewsService.download(scope, token);
            setInfo({ size: d.size, sha256: d.sha256 });
            window.location.assign(d.url);
          } catch (e) {
            setError(errorCode(e));
          }
        }}
      >
        <Download size={14} strokeWidth={1.75} aria-hidden="true" />
        {c("원본 받기", "Download original")}
      </button>
      {info && (
        <p className="break-all text-xs text-muted">
          {info.size} bytes · SHA-256 {info.sha256}
        </p>
      )}
      {error && <ReviewError code={error} />}
    </div>
  );
}

function LeadTools({
  scope,
  detail,
  reload,
}: {
  scope: ReviewScope & { kind: "project" };
  detail: ReviewDetail;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  return (
    <section className="space-y-3" aria-label={c("검토 관리", "Review tools")}>
      <h2 className="text-[13px] font-medium text-muted">{c("검토 관리", "Review tools")}</h2>
      <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
        <Shares scope={scope} detail={detail} c={c} />
        {detail.allowedActions.setApprover && <ApproverForm scope={scope} detail={detail} reload={reload} />}
        {detail.allowedActions.setAudience && <AudienceForm key={`audience:${detail.review.revision}`} scope={scope} detail={detail} reload={reload} />}
        {detail.allowedActions.replaceVersion && <ReplaceVersion key={`replace:${detail.review.revision}`} scope={scope} detail={detail} reload={reload} />}
      </div>
    </section>
  );
}

function AudienceForm({ scope, detail, reload }: { scope: ReviewScope & { kind: "project" }; detail: ReviewDetail; reload: () => Promise<void> }) {
  const c = useCopy();
  const [audience, setAudience] = useState<AudienceSelection>(() => detailAudience(detail));
  const [ready, setReady] = useState(false), [reason, setReason] = useState("");
  const mutation = useRun();
  return <form className={`${card} min-w-0 space-y-3 p-4`} onSubmit={async (e) => {
    e.preventDefault();
    const input = { revision: detail.review.revision, ...audienceInput(audience), reason: reason.trim() };
    const done = await mutation.run(input, (requestKey) => reviewsService.mutate(scope, "audience", { requestKey, ...input }));
    if (done) setReason("");
    await reload();
  }}>
    <h2 className="text-[13px] font-medium">{c("검토 대상 변경", "Change review audience")}</h2>
    <p className="-mt-2 text-xs leading-5 text-muted">{c("바꾸면 새 회차가 열리고 다시 승인받아야 합니다.", "Changing it opens a new round that needs a fresh approval.")}</p>
    <ReviewAudiencePicker scope={scope} value={audience} onChange={setAudience} disabled={mutation.busy} onValidityChange={setReady} />
    <label className="block space-y-2 text-sm"><span>{c("대상 변경 사유(필수)", "Audience-change reason (required)")}</span><input className={inputClass} value={reason} maxLength={1000} disabled={mutation.busy} onChange={(e) => setReason(e.target.value)} /></label>
    {mutation.error && <ReviewError code={mutation.error} />}
    <button type="submit" className={primaryClass} disabled={mutation.busy || !ready || !reason.trim()}>{c("대상을 확정하고 새 회차 공개", "Confirm audience and publish a new round")}</button>
  </form>;
}

const CLEAR = "clear";
function ApproverForm({
  scope,
  detail,
  reload,
}: {
  scope: ReviewScope & { kind: "project" };
  detail: ReviewDetail;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const read = useCallback(() => reviewsService.candidates(scope), [scope]);
  const { data, error } = useLoader(read, 0);
  const [userId, setUserId] = useState(""),
    [reason, setReason] = useState("");
  const mutation = useRun();
  const replacing = !!detail.approver;
  return (
    <form
      className={`${card} min-w-0 space-y-3 p-4`}
      onSubmit={async (e) => {
        e.preventDefault();
        const input = {
          revision: detail.review.revision,
          userId: userId === CLEAR ? null : userId,
          reason,
        };
        const done = await mutation.run(input, (requestKey) =>
          reviewsService.mutate(scope, "approver", { requestKey, ...input }),
        );
        if (done) setReason("");
        await reload();
      }}
    >
      <h2 className="text-[13px] font-medium">{c("최종 승인자", "Final approver")}</h2>
      {replacing && (
        <p className="-mt-2 text-xs leading-5 text-muted">
          {c("바꾸면 이전 결정은 이어지지 않습니다.", "Earlier decisions do not carry over to a new approver.")}
        </p>
      )}
      {error && <ReviewError code={error} />}
      <select className={inputClass} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label={c("승인자 선택", "Choose approver")}>
        <option value="">{c("선택", "Choose")}</option>
        {replacing && <option value={CLEAR}>{c("승인자 해제", "Clear approver")}</option>}
        {data?.candidates.map((p) => (
          <option key={`${p.basis}:${p.userId}`} value={p.userId}>
            {p.label} · {p.basis === "share" ? c("공유 수신자", "share recipient") : c("참여자", "participant")}
          </option>
        ))}
      </select>
      <label className="block space-y-1 text-sm">
        <span>{replacing ? c("변경 사유(필수)", "Reason (required)") : c("메모(선택)", "Note (optional)")}</span>
        <input className={inputClass} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} />
      </label>
      {mutation.error && <ReviewError code={mutation.error} />}
      <button
        type="submit"
        className={primaryClass}
        disabled={mutation.busy || !userId || (replacing && !reason.trim())}
      >
        {c("승인자 저장", "Save approver")}
      </button>
    </form>
  );
}

function ReplaceVersion({
  scope,
  detail,
  reload,
}: {
  scope: ReviewScope & { kind: "project" };
  detail: ReviewDetail;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const mutation = useRun();
  const [audience, setAudience] = useState<AudienceSelection>(() => detailAudience(detail));
  const [audienceReady, setAudienceReady] = useState(false), [reason, setReason] = useState("");
  const [assetId, setAssetId] = useState<string>();
  const [assetError, setAssetError] = useState("");
  useEffect(() => {
    // The asset of the current version, from the project's readable files.
    // Without it the picker would offer every series, so failure is shown.
    let live = true;
    fileApi(scope)
      .versions("")
      .then((list) => {
        const v = list.versions.find((x) => x.id === detail.review.versionId);
        if (!live) return;
        if (v) {
          setAssetId(v.assetId);
          setAssetError("");
        } else setAssetError("B2B_REVIEW_VERSION_UNAVAILABLE");
      })
      .catch((e) => live && setAssetError(errorCode(e)));
    return () => {
      live = false;
    };
  }, [scope, detail.review.versionId]);
  return (
    <section className={`${card} min-w-0 space-y-3 p-4`}>
      <h2 className="text-[13px] font-medium">{c("새 영상 버전으로 교체", "Replace with a new version")}</h2>
      <p className="-mt-2 text-xs leading-5 text-muted">
        {c("새 회차로 열리며, 이전 코멘트와 승인은 이전 회차에 남습니다.", "Opens a new round; earlier comments and decisions stay with their round.")}
      </p>
      <button type="button" className={secondaryClass} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {c("버전 선택", "Choose version")}
      </button>
      {assetError && <ReviewError code={assetError} />}
      {open && assetId && (
        <VideoVersionPicker
          scope={scope}
          assetId={assetId}
          exclude={detail.review.versionId}
          canPrepare
          disabled={mutation.busy}
          actionDisabled={!audienceReady || !reason.trim()}
          action={c("이 버전으로 교체", "Replace with this version")}
          onPick={async (version) => {
            const input = { revision: detail.review.revision, versionId: version.id, ...audienceInput(audience), reason: reason.trim() };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "round", { requestKey, ...input }),
            );
            if (done) setOpen(false);
            await reload();
          }}
        >
          <ReviewAudiencePicker scope={scope} value={audience} onChange={setAudience} disabled={mutation.busy} onValidityChange={setAudienceReady} />
          <label className="block space-y-2 text-sm"><span>{c("영상 교체 사유(필수)", "Video-replacement reason (required)")}</span><input className={inputClass} value={reason} maxLength={1000} disabled={mutation.busy} onChange={(e) => setReason(e.target.value)} /></label>
        </VideoVersionPicker>
      )}
      {mutation.error && <ReviewError code={mutation.error} />}
    </section>
  );
}

const shareUrl = (shareId: string, token: string) =>
  `${window.location.origin}/dashboard/review-shares/${shareId}#t=${token}`;
function Shares({
  scope,
  detail,
  c,
}: {
  scope: ReviewScope & { kind: "project" };
  detail: ReviewDetail;
  c: Copy;
}) {
  const read = useCallback(() => reviewsService.shares(scope), [scope]);
  const { data, error, load } = useLoader(read);
  const [recipients, setRecipients] = useState(""),
    [expiry, setExpiry] = useState(""),
    [allowDownload, setAllowDownload] = useState(false),
    [link, setLink] = useState("");
  const mutation = useRun();
  const emails = recipients.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  return (
    <section className={`${card} min-w-0 space-y-3 p-4`} aria-label={c("검토 공유", "Review sharing")}>
      <h2 className="text-[13px] font-medium">{c("검토 공유", "Review sharing")}</h2>
      <p className="-mt-2 text-xs leading-5 text-muted">
        {c(
          `현재 회차 V${detail.rounds.find((r) => r.current)?.ordinal}에 고정되며, 지정한 이메일 계정만 열 수 있습니다.`,
          "Shares the current round's version with the signed-in invited accounts only.",
        )}
      </p>
      {detail.allowedActions.share ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = {
              round: detail.review.round,
              versionId: detail.review.versionId,
              recipients: emails,
              ...(expiry ? { expiresAt: new Date(`${expiry}T23:59:00+09:00`).toISOString() } : {}),
              allowDownload,
            };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "share", { requestKey, ...input }),
            );
            if (done?.shareId) {
              const l = await reviewsService.shareLink(scope, done.shareId).catch(() => null);
              if (l) setLink(shareUrl(l.shareId, l.token));
              setRecipients("");
              setAllowDownload(false);
              setExpiry("");
            }
            await load();
          }}
        >
          <label className="block space-y-1 text-sm">
            <span>{c("공유받을 사람 이메일(쉼표·줄바꿈 구분, 최대 20명)", "Recipient emails (comma or newline, up to 20)")}</span>
            <textarea className={`${inputClass} min-h-16`} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
          </label>
          {/* Without a configured custom period every share lasts the default 7 days. */}
          {!!data?.customExpiryMaxDays && (
            <label className="block space-y-1 text-sm">
              <span>{c(`만료일 (비우면 7일, 최대 ${data.customExpiryMaxDays}일)`, `Expiry (empty = 7 days, at most ${data.customExpiryMaxDays})`)}</span>
              <input type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          )}
          <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
            {c("원본 다운로드 허용", "Allow original download")}
          </label>
          {mutation.error && <ReviewError code={mutation.error} />}
          <button type="submit" className={primaryClass} disabled={mutation.busy || !emails.length}>
            {c("공유하기", "Share")}
          </button>
        </form>
      ) : (
        <p className="text-sm text-muted">{c("검토본이 준비된 현재 회차만 공유할 수 있습니다.", "Only a current round with a ready review copy can be shared.")}</p>
      )}
      {link && <CopyLink url={link} c={c} />}
      {error && <ReviewError code={error} retry={() => void load()} />}
      <ul className="divide-y divide-border">
        {data?.shares.map((s) => (
          <ShareRow key={s.id} scope={scope} share={s} reload={load} onLink={setLink} c={c} />
        ))}
      </ul>
    </section>
  );
}
function CopyLink({ url, c }: { url: string; c: Copy }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-md bg-surface-secondary p-3 text-[13px]" aria-live="polite">
      <p>{c("받는 사람에게 이 링크를 직접 보내 주세요.", "Send this link to the recipients yourself.")}</p>
      <input className={`${inputClass} font-mono text-xs`} readOnly value={url} aria-label={c("공유 링크", "Share link")} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className={secondaryClass}
        onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
      >
        {copied ? c("복사됨", "Copied") : c("링크 복사", "Copy link")}
      </button>
    </div>
  );
}
function ShareRow({
  scope,
  share: s,
  reload,
  onLink,
  c,
}: {
  scope: ReviewScope & { kind: "project" };
  share: ReviewShare;
  reload: () => Promise<void>;
  onLink: (url: string) => void;
  c: Copy;
}) {
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const mutation = useRun();
  const label = { active: c("유효", "Active"), expired: c("만료", "Expired"), revoked: c("회수됨", "Revoked") }[s.state];
  return (
    <li className="space-y-2 py-3 text-[13px] first:pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          V{s.ordinal} · {label} · {c("만료", "Expires")} {kst(s.expiresAt)}
          {s.allowDownload && ` · ${c("원본 다운로드 허용", "Original download allowed")}`}
        </span>
        {s.state === "active" && (
          <button
            type="button"
            className={textButton}
            onClick={async () => {
              try {
                const l = await reviewsService.shareLink(scope, s.id);
                onLink(shareUrl(l.shareId, l.token));
              } catch (e) {
                setError(errorCode(e));
              }
            }}
          >
            {c("링크 다시 보기", "Show link")}
          </button>
        )}
      </div>
      <p className="break-all text-xs text-muted">
        {s.recipients.map((r) => `${r.email}${r.ended ? ` (${c("접근 종료", "ended")})` : ""}`).join(", ")}
      </p>
      {s.revoked && <p className="text-xs">{c("회수 사유", "Revoked")}: {s.revoked.reason}</p>}
      {s.state === "active" && (
        <div className="flex gap-2">
          <input className={`${inputClass} min-w-0 flex-1`} placeholder={c("회수 사유", "Reason to revoke")} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} aria-label={c("회수 사유", "Reason to revoke")} />
          <button
            type="button"
            className={secondaryClass}
            disabled={mutation.busy || !reason.trim()}
            onClick={async () => {
              const input = { reason };
              await mutation.run({ ...input, shareId: s.id }, (requestKey) =>
                reviewsService.mutate(scope, "revoke", { requestKey, ...input }, s.id),
              );
              await reload();
            }}
          >
            {c("공유 회수", "Revoke")}
          </button>
        </div>
      )}
      {(error || mutation.error) && <ReviewError code={error || mutation.error} />}
    </li>
  );
}
