"use client";
import { Fragment, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Command,
  CornerDownLeft,
  Share2,
  Download,
  FileDown,
  Maximize,
  MessageSquare,
  NotebookPen,
  Pause,
  Pencil,
  Play,
  Settings2,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  buttonClass,
  cardClass,
  EmptyState,
  IconButton,
  inputClass,
  Kbd,
  Select,
  Sheet,
  InfoTip,
} from "@/components/ui";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { assertExactReviewEntry, checkExactReviewTarget, parseExactReviewTarget, type ExactReviewTarget } from "@/lib/b2b-reviews/exact-target";
import { homeEnvironment } from "@/lib/b2b-home/home";
import { useI18n } from "@/lib/i18n/context";
import type {
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
import { TeamLoading } from "@/components/workspaces/shared";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { accessEnded, errorCode, useCopy } from "./shared";
import {
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
import { notificationApi } from "@/lib/b2b-notifications/notifications";

// SOT: prepix-backend backend/docs/b2b-reviews.md (S14/S15)
//
// Laid out like Frame.io and Dropbox Replay (2026-10-12): one window-tall
// workspace — the video and its timeline on the left, the comments beside it
// with the box to write in at their foot, everything rare behind 더보기.
// Keyboard first — Space/K play, J/L ±5s, ←/→ ±1s, I/O mark a range, C to
// comment.
type Copy = (ko: string, en: string) => string;
const RENEW_BEFORE_MS = 30_000;
// The Segmented track's look on a control whose roles stay toggle buttons
// (aria-pressed): the 요청 / 해결됨 filter.
const track = "inline-flex flex-wrap rounded-md bg-surface-secondary p-0.5";
const segment =
  "inline-flex h-7 items-center justify-center rounded-[5px] px-2.5 text-[13px] text-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-40 disabled:hover:text-muted aria-pressed:bg-background aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_rgba(0,0,0,0.08)]";
// Neutral mono chip for a time on the video (no amber).
const timeChip = "inline-flex h-5 items-center rounded-md px-1.5 font-mono text-[11px] tabular-nums text-foreground/80";

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
      back={`/dashboard/workspaces/${team}/projects/${projectId}`}
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
        "공유받은 검토만 볼 수 있습니다. 이 링크로 프로젝트의 다른 자료·요청·검토에는 들어갈 수 없습니다.",
        "You can see only this shared review. This link does not open the project's other files, requests or reviews.",
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
  // Watching it is reading it: the review leaves 확인할 영상 and the bell.
  const opened = data && scope.kind === "project" ? data.review.id : null;
  const account = scope.userId;
  useEffect(() => {
    if (opened) void notificationApi(account).readReview(opened).catch(() => undefined);
  }, [opened, account]);

  const video = useRef<HTMLVideoElement>(null);
  const composer = useRef<ComposerHandle>(null);
  const now = useRef(0);
  const [time, setTime] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  // 공유 (2026-10-08): showing this version to someone outside the team is
  // one button at the top, like a review tool's Share, not a card below.
  const [sharing, setSharing] = useState(false);
  const advanced = useOverlayState();
  const decision = useRun();
  const download = useVersionDownload(
    scope.kind === "project" ? scope : null,
    data?.rounds.find((r) => r.round === data.selectedRound)?.versionId,
  );
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
  // Where the video is now. Read from the element, not from the last
  // timeupdate: right after a scrub the seek may still be loading, and a
  // comment sent in that moment belongs to the new place (2026-10-12).
  const playhead = useCallback(
    () => (video.current ? Math.round(video.current.currentTime * 1000) : now.current),
    [],
  );
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
  // The meta line under the title, joined with " · ".
  const facts = [
    `V${selected.ordinal} · ${c("회차", "Round")} ${selected.round}${current ? "" : ` · ${c("이전 검토(읽기 전용)", "Previous round (read-only)")}`}`,
    // Who sees it is worth a line only when it is not everyone in the
    // project: a chosen few, or outsiders added.
    data.audience && (data.review.audienceScope !== "project" || data.audience.length > 0) &&
      `${c("현재 검토 대상", "Current review audience")}: ${data.review.audienceScope === "project"
        ? c("프로젝트 내부 전체 공개", "Everyone internal on the project") + (data.audience.length ? c(" · 외부 ", " · external ") + data.audience.map((p) => p.name ?? unnamed).join(", ") : "")
        : data.audience.map((p) => p.name ?? unnamed).join(", ")}`,
  ].filter(Boolean);
  // 상태 (2026-10-12): one question is left — is this the cut? What to change
  // is the comments' job (요청 / 해결됨), so 수정 요청 left the screen; 승인
  // stays, as one button, because sign-off is what a comment cannot say (the
  // bell, 확인할 영상 and delivery evidence read it).
  const decided = data.decisions.find((d) => d.current);
  const approved = decided?.decision === "approved" ? decided : null;
  const approve = async () => {
    // Pinned to what this screen shows; a newer version rejects it.
    const input = {
      revision: data.review.revision,
      round: data.review.round,
      versionId: data.review.versionId,
      decision: "approved" as const,
      reason: "",
    };
    await decision.run(input, (requestKey) =>
      reviewsService.mutate(scope, "decide", { requestKey, ...input }, undefined, token),
    );
    await load();
  };
  const unapprove = async () => {
    if (!approved) return;
    const input = { revision: data.review.revision, reason: "승인 취소" };
    await decision.run(input, (requestKey) =>
      reviewsService.mutate(scope, "cancel", { requestKey, ...input }, approved.id, token),
    );
    await load();
  };
  const rare =
    scope.kind === "project" && !exactTarget && (data.allowedActions.setAudience || data.allowedActions.replaceVersion);
  return (
    // A desktop gets a workspace, not a page: the header, then the player and
    // the comments side by side, each as tall as the window (Frame.io,
    // Dropbox Replay). The comment list scrolls on its own, the box to write
    // in stays at its foot. A phone keeps the video on top while the
    // comments scroll under it.
    <div className="flex flex-col gap-3 text-foreground lg:h-[calc(100dvh-6rem)]">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {back && (
            <Link
              href={back}
              aria-label={c("영상 목록", "All videos")}
              title={c("영상 목록", "All videos")}
              className={`${buttonClass({ variant: "ghost", size: "sm", icon: true })} -ml-1.5 text-muted`}
            >
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{data.review.title}</h1>
          {approved && (
            <span title={`${approved.approver.name ?? unnamed} · ${kst(approved.decidedAt)}`}>
              <Badge tone="success">{c("승인됨", "Approved")}</Badge>
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {data.rounds.length > 1 && (
              <Select
                size="sm"
                wrapperClassName="w-auto"
                className="pr-8 font-medium"
                aria-label={c("버전", "Version")}
                value={data.selectedRound}
                onChange={(e) => setRound(Number(e.target.value))}
              >
                {[...data.rounds].reverse().map((r) => (
                  <option key={r.round} value={r.round} disabled={!!exactTarget && r.round !== exactTarget.round}>
                    V{r.ordinal} · {r.current ? c("현재 검토", "Current") : c("이전 검토", "Previous")}
                  </option>
                ))}
              </Select>
            )}
            {data.allowedActions.decide && !approved && (
              <Button size="sm" disabled={decision.busy} onClick={() => void approve()}>
                <Check size={14} strokeWidth={2} aria-hidden="true" />
                {c("승인", "Approve")}
              </Button>
            )}
            {scope.kind === "project" && !exactTarget && (data.allowedActions.share || data.allowedActions.setAudience) && (
              <Button size="sm" variant="secondary" onClick={() => setSharing(true)}>
                <Share2 size={14} strokeWidth={1.75} aria-hidden="true" />
                {c("공유", "Share")}
              </Button>
            )}
            {scope.kind === "share" && data.allowedActions.download && <SharedDownload scope={scope} token={token ?? null} />}
            <RowMenu label={c("더보기", "More")}>
              {download.allowed && (
                <RowMenuItem onClick={() => void download.run()}>
                  <Download size={14} strokeWidth={1.75} aria-hidden="true" />
                  {c("이 버전 받기", "Download this version")}
                </RowMenuItem>
              )}
              {top.length > 0 && (
                <RowMenuItem onClick={() => exportComments(data, c)}>
                  <FileDown size={14} strokeWidth={1.75} aria-hidden="true" />
                  {c("코멘트 CSV로 내보내기", "Export comments as CSV")}
                </RowMenuItem>
              )}
              {approved && data.allowedActions.cancelDecision && (
                <RowMenuItem onClick={() => void unapprove()}>
                  <Undo2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  {c("승인 취소", "Withdraw approval")}
                </RowMenuItem>
              )}
              {rare && (
                <RowMenuItem onClick={advanced.open}>
                  <Settings2 size={14} strokeWidth={1.75} aria-hidden="true" />
                  {c("고급 설정", "Advanced")}
                </RowMenuItem>
              )}
            </RowMenu>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {/* The dot beside the fact, not in it: "현재 검토 대상: …" stays one
              text node that e2e and screen readers find by its exact words. */}
          {facts.map((fact, i) => (
            <Fragment key={i}>
              {i > 0 && <span aria-hidden="true">·</span>}
              <span className="min-w-0 break-words">{fact}</span>
            </Fragment>
          ))}
        </p>
        {(notice || exactTarget || !data.review.audienceConfirmed || selected.changeReason) && (
          <div className="space-y-0.5 text-xs text-muted">
            {notice && <p>{notice}</p>}
            {exactTarget && <p>{c("앱에서 선택한 영상 버전의 검토입니다.", "Review of the video version selected in the app.")}</p>}
            {!data.review.audienceConfirmed && <p role="status">{c("검토 대상 확정 전이에요. 대상을 확정하면 새 검토 회차가 시작돼요.", "The audience is unconfirmed. Confirming it opens a new review round.")}</p>}
            {selected.changeReason && <p>{c("회차 변경 사유", "Round-change reason")}: {selected.changeReason}</p>}
          </div>
        )}
      </header>
      {scope.reviewId !== NO_REVIEW && <ReviewPending scope={scope} token={token} currentRound={data.review.round} onConfirmed={() => void load()} />}
      {stale && <ReviewError code={error} retry={() => void load()} />}
      {pendingError && <ReviewError code={pendingError} retry={() => void load()} />}
      {decision.error && <ReviewError code={decision.error} retry={() => void load()} />}
      {download.error && <ReviewError code={download.error} />}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* The grid cell itself is sticky on a phone, so the video stays in
            view while the comments under it scroll. */}
        <div className="z-20 -mx-4 min-w-0 bg-background px-4 pb-2 max-lg:sticky max-lg:top-12 sm:-mx-6 sm:px-6 lg:mx-0 lg:min-h-0 lg:px-0 lg:pb-0">
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
        <Comments
          scope={scope}
          token={token}
          detail={data}
          pending={pending}
          playhead={playhead}
          time={time}
          focused={focused}
          composer={composer}
          pause={() => video.current?.pause()}
          onSeek={seek}
          reload={load}
        />
      </div>
      {sharing && scope.kind === "project" && (
        <Sheet title={c("공유", "Share")} onClose={() => setSharing(false)}>
          <div className="p-5">
            <Shares scope={scope} detail={data} c={c} />
          </div>
        </Sheet>
      )}
      {/* Who sees this version and swapping the video: rare, so behind 더보기;
          the dialog closes once one of them succeeds. */}
      {rare && scope.kind === "project" && (
        <Dialog state={advanced} title={c("고급 설정", "Advanced")} size="wide">
          <div className="grid gap-3 xl:grid-cols-2 xl:items-start">
            {data.allowedActions.setAudience && <AudienceForm key={`audience:${data.review.revision}`} scope={scope} detail={data} reload={load} onDone={advanced.close} />}
            {data.allowedActions.replaceVersion && <ReplaceVersion key={`replace:${data.review.revision}`} scope={scope} detail={data} reload={load} onDone={advanced.close} />}
          </div>
        </Dialog>
      )}
    </div>
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
      <div className="grid aspect-video place-items-center rounded-lg bg-black p-6 text-center text-sm text-white/80 lg:aspect-auto lg:h-full" aria-live="polite">
        <div className="space-y-3">
          <p>{previewCopy(detail.preview, c)}</p>
          {detail.preview.state === "failed" && detail.preview.failureCode && (
            <p className="text-white/50">{detail.preview.failureCode}</p>
          )}
          {detail.allowedActions.retryPreview && scope.kind === "project" && (
            <Button
              variant="secondary"
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
            </Button>
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
    <div className="flex flex-col gap-2 lg:h-full lg:min-h-0">
      {ended ? (
        <ReviewError code={ended} />
      ) : (
        // On a desktop the stage is as tall as the picture, and shrinks
        // (the picture kept whole, object-contain) only when the window is
        // shorter than that.
        <div
          ref={stage}
          className="flex flex-col overflow-hidden rounded-lg bg-black text-white lg:min-h-0 [&:fullscreen]:rounded-none [&:fullscreen_video]:aspect-auto [&:fullscreen_video]:min-h-0 [&:fullscreen_video]:flex-1"
        >
          <video
            ref={video}
            className="aspect-video w-full cursor-pointer bg-black object-contain lg:min-h-0"
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
                      className="absolute inset-y-0 bg-white/40"
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
                  const ms = Number(e.target.value);
                  if (v) v.currentTime = ms / 1000;
                  // Shown at once, not when the seek has loaded.
                  setPos(ms);
                  onTime(ms);
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
                    className={`absolute top-0.5 size-2 -translate-x-1/2 rounded-full transition-transform hover:scale-150 ${m.resolved ? "bg-white/35" : "bg-white"}`}
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
      {/* Shortcuts are for a keyboard; on a phone the line is not drawn. */}
      <div className="hidden justify-end lg:flex">
        <InfoTip label={c("단축키와 재생 안내", "Shortcuts and playback")} text={c("단축키", "Shortcuts")} className="text-xs">
          <ul className="space-y-1.5">
            {(
              [
                [["Space", "K"], c("재생 · 일시정지", "Play · pause")],
                [["J", "L"], c("5초 뒤로 · 앞으로", "Back · forward 5s")],
                [["←", "→"], c("1초 뒤로 · 앞으로", "Back · forward 1s")],
                [["I", "O"], c("구간 시작 · 끝", "Range in · out")],
                [["C"], c("코멘트 쓰기", "Write a comment")],
                [["M"], c("소리 끄기 · 켜기", "Mute · unmute")],
              ] as const
            ).map(([keys, label]) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span>{label}</span>
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p>
            {c(
              "재생 주소는 최대 5분 동안 유효하며 만료 전에 현재 권한으로 다시 받아 이어서 재생합니다. 공유 회수나 참여 종료 뒤에는 새 주소가 발급되지 않지만, 이미 발급된 주소는 만료 시각(최대 5분)까지 남을 수 있습니다.",
              "Playback URLs last at most 5 minutes and are renewed with your current access. After a revoked share or ended participation no new URL is issued, but an already issued URL can remain usable until it expires (up to 5 minutes).",
            )}
          </p>
        </InfoTip>
      </div>
    </div>
  );
}

function useAgo() {
  const { lang } = useI18n();
  return (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    const rtf = new Intl.RelativeTimeFormat(lang === "ko" ? "ko-KR" : "en-US", { numeric: "auto" });
    // rtf.format(0, "minute") reads "현재 분" in Korean.
    if (minutes < 1) return lang === "ko" ? "방금" : "just now";
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

/** Long text folds to a few lines with 더 보기, so one essay does not push
 * every other comment out of the panel. */
function Clamp({ lines, className = "", children }: { lines: 3 | 4; className?: string; children: ReactNode }) {
  const c = useCopy();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const n = box.current;
    if (!n || open) return;
    // Measured again whenever the box changes size (a narrower panel, an
    // edited comment), not on every render.
    const measure = () => setOver(n.scrollHeight > n.clientHeight + 1);
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(n);
    return () => watch.disconnect();
  }, [open]);
  return (
    <>
      <div ref={box} className={`${className} ${open ? "" : lines === 3 ? "line-clamp-3" : "line-clamp-4"}`}>
        {children}
      </div>
      {(over || open) && (
        <button type="button" className="text-xs font-medium text-muted hover:text-foreground" onClick={() => setOpen((v) => !v)}>
          {open ? c("접기", "Show less") : c("더 보기", "Show more")}
        </button>
      )}
    </>
  );
}

/**
 * 버전 메모 (2026-10-12): what changed in this version, written by whoever
 * shares it (the project's managers or the publisher), above the comments
 * on it. The gray tray with a white card is affectUI's ChangeSummary look.
 */
function VersionNote({
  scope,
  detail,
  reload,
}: {
  scope: ReviewScope;
  detail: ReviewDetail;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const ago = useAgo();
  const shown = detail.rounds.find((r) => r.round === detail.selectedRound)!;
  const note = shown.note;
  const canEdit = scope.kind === "project" && detail.allowedActions.editNote;
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!note && !canEdit) return null;
  const title = c(`V${shown.ordinal} 메모`, `V${shown.ordinal} note`);
  const save = async () => {
    if (scope.kind !== "project" || text === null) return;
    setBusy(true);
    setError("");
    try {
      await reviewsService.setNote(scope, shown.versionId, text);
      setText(null);
      await reload();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
  };
  if (text !== null)
    return (
      <form
        className="space-y-2 border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <textarea
          autoFocus
          className={`${inputClass} min-h-20 resize-none [field-sizing:content]`}
          value={text}
          maxLength={2000}
          aria-label={title}
          placeholder={c("이 버전에서 바뀐 점, 봐 줬으면 하는 부분", "What changed in this version, what to look at")}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setText(null);
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void save();
            }
          }}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setText(null)}>
            {c("취소", "Cancel")}
          </Button>
          <Button size="sm" type="submit" disabled={busy}>
            {c("메모 저장", "Save note")}
          </Button>
        </div>
        {error && <ReviewError code={error} />}
      </form>
    );
  if (!note)
    return (
      <div className="border-b border-border px-3 py-2">
        <Button variant="ghost" size="xs" className="-ml-1 text-muted" onClick={() => setText("")}>
          <NotebookPen size={13} strokeWidth={1.75} aria-hidden="true" />
          {c(`V${shown.ordinal}에 메모 남기기`, `Add a note to V${shown.ordinal}`)}
        </Button>
      </div>
    );
  return (
    <section aria-label={title} className="border-b border-border p-2">
      <div className="rounded-lg bg-surface-secondary p-1">
        <div className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-xs">
          <NotebookPen size={13} strokeWidth={1.75} aria-hidden="true" className="text-muted" />
          <span className="font-medium">{title}</span>
          <span className="min-w-0 truncate text-muted" title={kst(note.at)}>
            {note.by.name ?? c("이름 없음", "Unnamed")} · {ago(note.at)}
          </span>
          <span className="flex-1" />
          {canEdit && (
            <IconButton size="xs" label={c("메모 수정", "Edit note")} onClick={() => setText(note.body)}>
              <Pencil size={12} strokeWidth={1.75} aria-hidden="true" />
            </IconButton>
          )}
        </div>
        <div className="rounded-md bg-background px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <Clamp lines={3} className="whitespace-pre-wrap break-words text-[13px] leading-5">
            {note.body}
          </Clamp>
        </div>
      </div>
    </section>
  );
}

function Comments({
  scope,
  token,
  detail,
  pending,
  playhead,
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
  playhead: () => number;
  time: number;
  focused: string | null;
  composer: Ref<ComposerHandle>;
  pause: () => void;
  onSeek: (ms: number, commentId?: string) => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  // 요청 / 해결됨 (2026-10-12): a comment is a request until someone ticks it.
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const sending = pending.filter((r) => r.action === "comment" && r.input.round === detail.selectedRound);
  const top = detail.comments.filter((m) => !m.parentId);
  const open = top.filter((m) => !m.resolved);
  const done = top.filter((m) => m.resolved);
  const shown = filter === "open" ? open : done;
  return (
    <section
      aria-label={c("코멘트", "Comments")}
      className="flex min-w-0 flex-col rounded-lg border border-border bg-background lg:min-h-0 lg:overflow-hidden"
    >
      <VersionNote key={`${detail.selectedRound}`} scope={scope} detail={detail} reload={reload} />
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <div className={track} role="group" aria-label={c("코멘트 보기", "Comment filter")}>
          {(
            [
              ["open", c("요청", "Requests"), open.length],
              ["resolved", c("해결됨", "Resolved"), done.length],
            ] as const
          ).map(([key, label, count]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={segment}>
              {label}{" "}
              <span className="ml-0.5 tabular-nums text-muted">{count}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {sending.map((r) => (
          <article key={r.input.requestKey} className="border-b border-dashed border-border px-3 py-2.5 text-sm" aria-live="polite">
            <p className="text-xs text-muted">
              {timecode(r.input.startMs as number)} · {c("전송 확인 대기 — 아직 공개되지 않았습니다", "Awaiting confirmation — not published yet")}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words">{r.input.body as string}</p>
          </article>
        ))}
        {shown.length === 0 && !sending.length ? (
          <EmptyState
            frame="none"
            icon={MessageSquare}
            title={
              filter === "resolved"
                ? c("해결된 코멘트가 없어요.", "Nothing resolved yet.")
                : top.length
                  ? c("남은 요청이 없어요.", "No open requests.")
                  : c("아직 코멘트가 없어요.", "No comments yet.")
            }
            description={
              filter === "open" && !top.length && detail.allowedActions.comment
                ? c("영상을 보다가 장면에 의견을 남겨 보세요.", "Pause on a moment and leave feedback.")
                : undefined
            }
          />
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
        <Composer
          ref={composer}
          scope={scope}
          token={token}
          detail={detail}
          playhead={playhead}
          time={time}
          pause={pause}
          reload={reload}
          onPosted={() => setFilter("open")}
        />
      )}
    </section>
  );
}

/** Unsent text is a per-account/service/review/round draft on this device;
 * it never shows as a published comment. The comment sits where the playhead
 * is — while typing too, so scrubbing moves it (2026-10-12) — until I/O or
 * the 시작점/끝점 buttons fix a time or a range. */
function Composer({
  ref,
  scope,
  token,
  detail,
  playhead,
  time,
  pause,
  reload,
  onPosted,
}: {
  ref: Ref<ComposerHandle>;
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  playhead: () => number;
  time: number;
  pause: () => void;
  reload: () => Promise<void>;
  onPosted: () => void;
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
  const at = () => Math.min(playhead(), Math.max(0, duration - 1));
  const markIn = () => {
    const s = at();
    setStart(s);
    setPinned(true);
    if (endMs !== null && endMs <= s) setEnd(null);
  };
  const markOut = () => {
    const s = pinned ? startMs : at();
    const t = playhead();
    if (t > s) {
      setStart(s);
      setPinned(true);
      setEnd(Math.min(t, duration));
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
          // the user is typing. A range was set on purpose and comes back;
          // a single time follows the playhead again.
          if (d && !typed.current) {
            setBody(d.body);
            if (d.endMs !== null) {
              setStart(d.startMs);
              setEnd(d.endMs);
              setPinned(true);
            }
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
      onPosted();
      await reviewStore.saveDraft(scope, round, null).catch(() => {});
    }
    await reload();
  };
  return (
    <form
      className="shrink-0 border-t border-border bg-background p-2 max-lg:sticky max-lg:bottom-0 max-lg:z-10"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="rounded-lg border border-border bg-background transition-colors focus-within:border-foreground/40">
        <textarea
          ref={field}
          className="block max-h-40 min-h-[4.5rem] w-full resize-none bg-transparent px-3 pb-1 pt-2.5 text-sm leading-6 outline-none [field-sizing:content] placeholder:text-muted disabled:opacity-50"
          value={body}
          maxLength={2000}
          rows={2}
          disabled={mutation.busy}
          aria-label={c("코멘트 내용", "Comment text")}
          placeholder={c(`${clock(shownStart)}에 의견 남기기`, `Comment at ${clock(shownStart)}`)}
          // Writing stops the video on the frame being talked about; the
          // time still follows the playhead if they scrub on.
          onFocus={pause}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !mutation.busy) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          <span
            className={`${timeChip} mr-0.5 ${pinned ? "bg-foreground/10" : "bg-surface-secondary"}`}
            aria-live="off"
            title={pinned ? c("고정된 위치", "Fixed time") : c("재생 위치를 따라가요", "Follows the playhead")}
          >
            {clock(shownStart)}
            {endMs !== null && ` – ${clock(endMs)}`}
          </span>
          <Button variant="ghost" size="xs" onClick={markIn} aria-label={c("현재 위치를 시작으로", "Start at playhead")} title="I">
            {c("시작점", "In")}
          </Button>
          <Button variant="ghost" size="xs" onClick={markOut} aria-label={c("현재 위치를 끝으로", "End at playhead")} title="O">
            {c("끝점", "Out")}
          </Button>
          {pinned && (
            <IconButton
              size="xs"
              onClick={() => {
                setEnd(null);
                setPinned(false);
              }}
              label={endMs !== null ? c("구간 해제", "Clear range") : c("시작점 해제", "Clear start")}
            >
              <X size={12} aria-hidden="true" />
            </IconButton>
          )}
          <span className="flex-1" />
          <Kbd className="hidden gap-0.5 sm:inline-flex" aria-hidden="true"><Command size={10} /><CornerDownLeft size={10} /></Kbd>
          <Button type="submit" size="sm" disabled={mutation.busy || !body.trim()} aria-busy={mutation.busy || undefined}>
            {mutation.busy ? c("전송 중", "Sending") : c("코멘트 남기기", "Post comment")}
          </Button>
        </div>
      </div>
      {draftError && <ReviewError code={draftError} />}
      {mutation.error && <ReviewError code={mutation.error} />}
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
  const [mode, setMode] = useState<"" | "edit" | "reply">("");
  const [history, setHistory] = useState(false);
  // A long thread shows its latest reply; the rest open on request.
  const [thread, setThread] = useState(false);
  const mutation = useRun();
  const row = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  const canAct = detail.allowedActions.comment;
  const resolve = async () => {
    const input = { resolved: !m.resolved };
    await mutation.run(input, (requestKey) =>
      reviewsService.mutate(scope, "resolve", { requestKey, ...input }, m.id, token),
    );
    await reload();
  };
  const folded = replies.length > 2 && !thread;
  const visible = folded ? replies.slice(-1) : replies;
  return (
    <li ref={row} className={`group px-3 py-2.5 transition-colors ${active || focused ? "bg-surface-secondary" : ""}`}>
      <div className="flex min-h-6 items-center gap-2">
        <Avatar id={m.author.userId} name={m.author.name ?? "?"} size={20} />
        <span className="truncate text-[13px] font-medium">{m.author.name ?? c("이름 없음", "Unnamed")}</span>
        <span className="shrink-0 text-xs text-muted" title={kst(m.createdAt)}>
          {ago(m.createdAt)}
          {m.revision > 1 && ` · ${c("수정됨", "Edited")}`}
        </span>
        <span className="flex-1" />
        {canAct ? (
          <IconButton
            size="xs"
            onClick={() => void resolve()}
            disabled={mutation.busy}
            aria-pressed={!!m.resolved}
            label={m.resolved ? c("요청으로 되돌리기", "Reopen") : c("해결로 표시", "Mark resolved")}
            title={m.resolved ? c("요청으로 되돌리기", "Reopen") : c("해결로 표시", "Mark resolved")}
            className="-my-0.5 rounded-full border border-border aria-pressed:border-transparent aria-pressed:bg-success/15 aria-pressed:text-success-ink"
          >
            <Check size={12} strokeWidth={2.25} aria-hidden="true" />
          </IconButton>
        ) : (
          m.resolved && <Check size={14} className="text-success-ink" aria-label={c("해결됨", "Resolved")} />
        )}
      </div>
      <div className="mt-1 space-y-1 pl-7">
        {mode === "edit" ? (
          <EditForm scope={scope} token={token} comment={m} onDone={() => setMode("")} reload={reload} />
        ) : (
          <Clamp lines={4} className="text-sm leading-6">
            <button
              type="button"
              className={`${timeChip} mr-1.5 align-[1px] transition-colors hover:bg-surface-tertiary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${active || focused ? "bg-surface-tertiary" : "bg-surface-secondary"}`}
              aria-label={span(m)}
              onClick={() => onSeek(m.startMs, m.id)}
            >
              {clock(m.startMs)}
              {m.endMs !== null && ` – ${clock(m.endMs)}`}
            </button>
            <span className="whitespace-pre-wrap break-words">{m.body}</span>
          </Clamp>
        )}
        {m.resolved && (
          <p className="text-xs text-muted">
            {c(`${m.resolved.by.name ?? "이름 없음"} 님이 해결함`, `Resolved by ${m.resolved.by.name ?? "someone"}`)}
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
          <ul className="mt-1.5 space-y-2 border-l border-border pl-3">
            {folded && (
              <li>
                <button type="button" className="text-xs font-medium text-muted hover:text-foreground" onClick={() => setThread(true)}>
                  {c(`이전 답글 ${replies.length - 1}개 보기`, `Show ${replies.length - 1} earlier replies`)}
                </button>
              </li>
            )}
            {visible.map((r) => (
              <Reply key={r.id} scope={scope} token={token} comment={r} reload={reload} />
            ))}
          </ul>
        )}
        {mode !== "edit" && (canAct || m.canEdit || m.revision > 1) && mode !== "reply" && (
          <div className="-ml-2 flex flex-wrap gap-0.5">
            {canAct && (
              <Button variant="ghost" size="xs" className="text-muted" onClick={() => setMode("reply")}>
                {c("답글", "Reply")}
              </Button>
            )}
            {m.canEdit && (
              <Button variant="ghost" size="xs" className="text-muted" onClick={() => setMode("edit")}>
                {c("수정", "Edit")}
              </Button>
            )}
            {m.revision > 1 && (
              <Button variant="ghost" size="xs" className="text-muted" onClick={() => setHistory((v) => !v)}>
                {c("수정 이력", "Edit history")}
              </Button>
            )}
          </div>
        )}
        {mode === "reply" && <ReplyForm scope={scope} token={token} detail={detail} parent={m} onDone={() => setMode("")} reload={reload} />}
        {mutation.error && <ReviewError code={mutation.error} />}
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
      <div className="flex items-center gap-1.5">
        <Avatar id={r.author.userId} name={r.author.name ?? "?"} size={16} />
        <span className="truncate text-[13px] font-medium">{r.author.name ?? c("이름 없음", "Unnamed")}</span>
        <span className="shrink-0 text-xs text-muted" title={kst(r.createdAt)}>
          {ago(r.createdAt)}
          {r.revision > 1 && ` · ${c("수정됨", "Edited")}`}
        </span>
        {r.canEdit && !editing && (
          <Button variant="ghost" size="xs" className="ml-auto text-muted" onClick={() => setEditing(true)}>
            {c("수정", "Edit")}
          </Button>
        )}
      </div>
      {editing ? (
        <EditForm scope={scope} token={token} comment={r} onDone={() => setEditing(false)} reload={reload} />
      ) : (
        <Clamp lines={4} className="whitespace-pre-wrap break-words text-sm leading-6">
          {r.body}
        </Clamp>
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
      <textarea className={`${inputClass} min-h-16`} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} aria-label={c("수정할 내용", "Edited text")} />
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={mutation.busy || !body.trim()}>
          {c("수정 저장", "Save edit")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          {c("취소", "Cancel")}
        </Button>
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
        className={`${inputClass} min-h-14 resize-none`}
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
        <Button size="sm" type="submit" disabled={mutation.busy || !body.trim()}>
          {c("답글 남기기", "Reply")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          {c("취소", "Cancel")}
        </Button>
      </div>
      {mutation.error && <ReviewError code={mutation.error} />}
    </form>
  );
}


/** P (2026-10-07): teammates download what was published into the folder —
 * the exact version this round plays, through the folder's files download
 * (short-lived attachment URL). Offered (in 더보기) only when the files API
 * says this account may download it. */
function useVersionDownload(scope: (ReviewScope & { kind: "project" }) | null, versionId: string | undefined) {
  const [verdict, setVerdict] = useState<{ versionId: string; allowed: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!scope || !versionId) return;
    let live = true;
    fileApi(scope)
      .version(versionId)
      .then(({ version }) => live && setVerdict({ versionId, allowed: version.allowedActions.download }))
      .catch(() => live && setVerdict({ versionId, allowed: false }));
    return () => {
      live = false;
    };
  }, [scope, versionId]);
  return {
    allowed: !!scope && !!versionId && verdict?.versionId === versionId && verdict.allowed,
    error,
    run: async () => {
      if (!scope || !versionId) return;
      setError("");
      try {
        window.location.assign((await fileApi(scope).download(versionId)).url);
      } catch (e) {
        setError(fileError(e));
      }
    },
  };
}

function SharedDownload({ scope, token }: { scope: ReviewScope; token: string | null }) {
  const c = useCopy();
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ size: number; sha256: string } | null>(null);
  return (
    <div className="space-y-2 text-sm">
      <Button
        variant="secondary"
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
      </Button>
      {info && (
        <p className="break-all text-xs text-muted">
          {info.size} bytes · SHA-256 {info.sha256}
        </p>
      )}
      {error && <ReviewError code={error} />}
    </div>
  );
}

function AudienceForm({ scope, detail, reload, onDone }: { scope: ReviewScope & { kind: "project" }; detail: ReviewDetail; reload: () => Promise<void>; onDone?: () => void }) {
  const c = useCopy();
  const [audience, setAudience] = useState<AudienceSelection>(() => detailAudience(detail));
  const [ready, setReady] = useState(false);
  const mutation = useRun();
  return <form className={`${cardClass} min-w-0 space-y-3 p-5`} onSubmit={async (e) => {
    e.preventDefault();
    const input = { revision: detail.review.revision, ...audienceInput(audience), reason: "검토 대상 변경" };
    const done = await mutation.run(input, (requestKey) => reviewsService.mutate(scope, "audience", { requestKey, ...input }));
    await reload();
    if (done) onDone?.();
  }}>
    <h2 className="text-base font-semibold">{c("검토 대상 변경", "Change review audience")}</h2>
    <p className="-mt-2 text-[13px] leading-5 text-muted">{c("바꾸면 새 회차가 열리고 다시 승인받아야 합니다.", "Changing it opens a new round that needs a fresh approval.")}</p>
    <ReviewAudiencePicker scope={scope} value={audience} onChange={setAudience} disabled={mutation.busy} onValidityChange={setReady} />
    {mutation.error && <ReviewError code={mutation.error} />}
    <Button type="submit" disabled={mutation.busy || !ready}>{c("대상을 확정하고 새 회차 공개", "Confirm audience and publish a new round")}</Button>
  </form>;
}

function ReplaceVersion({
  scope,
  detail,
  reload,
  onDone,
}: {
  scope: ReviewScope & { kind: "project" };
  detail: ReviewDetail;
  reload: () => Promise<void>;
  onDone?: () => void;
}) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const mutation = useRun();
  const [audience, setAudience] = useState<AudienceSelection>(() => detailAudience(detail));
  const [audienceReady, setAudienceReady] = useState(false);
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
    <section className={`${cardClass} min-w-0 space-y-3 p-5`}>
      <h2 className="text-base font-semibold">{c("새 영상 버전으로 교체", "Replace with a new version")}</h2>
      <p className="-mt-2 text-[13px] leading-5 text-muted">
        {c("새 회차로 열리며, 이전 코멘트와 승인은 이전 회차에 남습니다.", "Opens a new round; earlier comments and decisions stay with their round.")}
      </p>
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {c("버전 선택", "Choose version")}
      </Button>
      {assetError && <ReviewError code={assetError} />}
      {open && assetId && (
        <VideoVersionPicker
          scope={scope}
          assetId={assetId}
          exclude={detail.review.versionId}
          canPrepare
          disabled={mutation.busy}
          actionDisabled={!audienceReady}
          action={c("이 버전으로 교체", "Replace with this version")}
          onPick={async (version) => {
            const input = { revision: detail.review.revision, versionId: version.id, ...audienceInput(audience), reason: "새 영상 버전으로 교체" };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "round", { requestKey, ...input }),
            );
            if (done) setOpen(false);
            await reload();
            if (done) onDone?.();
          }}
        >
          <ReviewAudiencePicker scope={scope} value={audience} onChange={setAudience} disabled={mutation.busy} onValidityChange={setAudienceReady} />
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
    [link, setLink] = useState("");
  const mutation = useRun();
  const emails = recipients.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  return (
    <section className="min-w-0 space-y-4" aria-label={c("검토 공유", "Review sharing")}>
      <p className="text-[13px] leading-6 text-muted">
        {c(
          `팀 밖의 사람에게 이 영상(V${detail.rounds.find((r) => r.current)?.ordinal})을 보여줍니다. 받는 사람은 그 이메일로 로그인해서 보고 코멘트할 수 있습니다.`,
          `Show this video (V${detail.rounds.find((r) => r.current)?.ordinal}) to people outside the team. They sign in with that email to watch and comment.`,
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
              // A share link is watch-and-comment (2026-10-08), like a viewer.
              allowDownload: false,
            };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "share", { requestKey, ...input }),
            );
            if (done?.shareId) {
              const l = await reviewsService.shareLink(scope, done.shareId).catch(() => null);
              if (l) setLink(shareUrl(l.shareId, l.token));
              setRecipients("");
              setExpiry("");
            }
            await load();
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium">{c("공유받을 사람 이메일(쉼표·줄바꿈 구분, 최대 20명)", "Recipient emails (comma or newline, up to 20)")}</span>
            <textarea className={`${inputClass} min-h-16`} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
          </label>
          {/* Without a configured custom period every share lasts the default 7 days. */}
          {!!data?.customExpiryMaxDays && (
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium">{c(`만료일 (비우면 7일, 최대 ${data.customExpiryMaxDays}일)`, `Expiry (empty = 7 days, at most ${data.customExpiryMaxDays})`)}</span>
              <input type="date" className={inputClass} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
            </label>
          )}
          {mutation.error && <ReviewError code={mutation.error} />}
          <Button type="submit" disabled={mutation.busy || !emails.length}>
            {c("공유하기", "Share")}
          </Button>
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
    <div className="space-y-2 rounded-lg bg-surface-secondary p-3 text-[13px]" aria-live="polite">
      <p>{c("받는 사람에게 이 링크를 직접 보내 주세요.", "Send this link to the recipients yourself.")}</p>
      <input className={`${inputClass} font-mono text-xs`} readOnly value={url} aria-label={c("공유 링크", "Share link")} onFocus={(e) => e.currentTarget.select()} />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
      >
        {copied ? c("복사됨", "Copied") : c("링크 복사", "Copy link")}
      </Button>
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
  const [error, setError] = useState("");
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
          <Button
            variant="ghost"
            size="xs"
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
          </Button>
        )}
      </div>
      <p className="break-all text-xs text-muted">
        {s.recipients.map((r) => `${r.email}${r.ended ? ` (${c("접근 종료", "ended")})` : ""}`).join(", ")}
      </p>
      {s.state === "active" && (
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={mutation.busy}
            onClick={async () => {
              const input = { reason: "공유 회수" };
              await mutation.run({ ...input, shareId: s.id }, (requestKey) =>
                reviewsService.mutate(scope, "revoke", { requestKey, ...input }, s.id),
              );
              await reload();
            }}
          >
            {c("공유 회수", "Revoke")}
          </Button>
        </div>
      )}
      {(error || mutation.error) && <ReviewError code={error || mutation.error} />}
    </li>
  );
}
