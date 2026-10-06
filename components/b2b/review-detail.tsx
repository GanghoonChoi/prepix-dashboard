"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { assertExactReviewEntry, checkExactReviewTarget, parseExactReviewTarget, type ExactReviewTarget } from "@/lib/b2b-reviews/exact-target";
import { homeEnvironment } from "@/lib/b2b-home/home";
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
import { fileApi } from "@/lib/b2b-files/api";
import { audienceInput, type ReviewRecord, type ReviewScope } from "@/lib/b2b-reviews/operations";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { accessEnded, errorCode, useCopy } from "./shared";
import {
  approvalCopy,
  Badge,
  kst,
  previewCopy,
  ReviewError,
  ReviewAudiencePicker,
  projectAudience,
  type AudienceSelection,
  timecode,
  useLoader,
  useRun,
  useTeamScope,
  VideoVersionPicker,
} from "./reviews";
import { ReviewPending } from "./review-pending";

// SOT: prepix-backend backend/docs/b2b-reviews.md (S14/S15)
type Copy = (ko: string, en: string) => string;
const RENEW_BEFORE_MS = 30_000;

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
        "공유받은 검토만 볼 수 있습니다. 이 링크로 프로젝트의 다른 자료·요청·검토에는 들어갈 수 없습니다.",
        "You can see only this shared review. This link does not open the project's other files, requests or reviews.",
      )}
    />
  );
}

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
  const [seek, setSeek] = useState<{ ms: number } | null>(null);
  const now = useRef(0);
  if (!data)
    return error ? (
      <ReviewError code={error} retry={() => void load()} />
    ) : (
      <TeamLoading />
    );
  const selected = data.rounds.find((r) => r.round === data.selectedRound)!;
  const current = data.selectedRound === data.review.round;
  return (
    <TeamShell
      title={data.review.title}
      description={`V${selected.ordinal} · ${c("회차", "Round")} ${selected.round}${current ? "" : ` · ${c("이전 검토(읽기 전용)", "Previous round (read-only)")}`}`}
    >
      {notice && <p className="text-sm text-muted">{notice}</p>}
      {exactTarget && <p className="text-sm text-muted">{c("앱에서 선택한 영상 버전의 검토입니다.", "Review of the video version selected in the app.")}</p>}
      {scope.reviewId !== NO_REVIEW && <ReviewPending scope={scope} token={token} currentRound={data.review.round} onConfirmed={() => void load()} />}
      {stale && <ReviewError code={error} retry={() => void load()} />}
      {pendingError && <ReviewError code={pendingError} retry={() => void load()} />}
      <div className="flex flex-wrap items-center gap-3">
        {back && (
          <Link className={secondaryClass} href={back}>
            {c("검토 목록", "Reviews")}
          </Link>
        )}
        <Badge>{c(...approvalCopy[data.approval])}</Badge>
        {data.approver && (
          <span className="text-sm text-muted">
            {c("승인자", "Approver")} {data.approver.person.name ?? c("이름 없음", "Unnamed")}
            {data.approver.person.userId === data.currentUserId && c(" (나)", " (you)")}
          </span>
        )}
      </div>
      {data.audience && <p className="text-sm text-muted">{c("현재 검토 대상", "Current review audience")}: {data.review.audienceScope === "project" ? c("프로젝트 전체 공개", "Everyone on the project") : data.audience.map((p) => p.name ?? c("이름 없음", "Unnamed")).join(", ")}</p>}
      {!data.review.audienceConfirmed && <p role="status" className="text-sm text-muted">{c("검토 대상·승인자 확정 전입니다. 담당자가 대상을 확정하면 새 검토 회차가 시작됩니다.", "The audience and approver are unconfirmed. Confirming them opens a new review round.")}</p>}
      {selected.changeReason && <p className="text-sm text-muted">{c("회차 변경 사유", "Round-change reason")}: {selected.changeReason}</p>}
      {data.rounds.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label={c("검토 회차", "Review rounds")}>
          {data.rounds.map((r) => (
            <button
              key={r.round}
              type="button"
              aria-pressed={r.round === data.selectedRound}
              disabled={!!exactTarget && r.round !== exactTarget.round}
              className={`${secondaryClass} ${r.round === data.selectedRound ? "bg-surface font-medium" : ""}`}
              onClick={() => setRound(r.round)}
            >
              V{r.ordinal} · {r.current ? c("현재 검토", "Current") : c("이전 검토", "Previous")}
            </button>
          ))}
        </nav>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <ReviewPlayer
            key={`${scope.reviewId}:${data.selectedRound}`}
            scope={scope}
            token={token}
            detail={data}
            seek={seek}
            onTime={(ms) => (now.current = ms)}
          />
          <Markers detail={data} onSeek={(ms) => setSeek({ ms })} />
        </div>
        <div className="min-w-0 space-y-6">
          <Approval scope={scope} token={token} detail={data} reload={load} />
          <Comments
            scope={scope}
            token={token}
            detail={data}
            pending={pending}
            now={now}
            onSeek={(ms) => setSeek({ ms })}
            reload={load}
          />
        </div>
      </div>
      {scope.kind === "share" && data.allowedActions.download && <SharedDownload scope={scope} token={token ?? null} />}
      {!exactTarget && scope.kind === "project" && (data.allowedActions.setAudience || data.allowedActions.setApprover || data.allowedActions.replaceVersion) && (
        <LeadTools scope={scope} detail={data} reload={load} />
      )}
    </TeamShell>
  );
}

/** Playback URLs live at most 5 minutes. Each renewal rechecks access; a
 * revoked viewer gets no new URL and playback stops at the old URL's end. */
function ReviewPlayer({
  scope,
  token,
  detail,
  seek,
  onTime,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  seek: { ms: number } | null;
  onTime: (ms: number) => void;
}) {
  const c = useCopy();
  const video = useRef<HTMLVideoElement>(null);
  const resume = useRef<{ at: number; playing: boolean } | null>(null);
  const [source, setSource] = useState<{ url: string; expiresAt: number } | null>(null);
  const [ended, setEnded] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    [scope, token, detail.selectedRound],
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
  useEffect(() => {
    if (seek && video.current && source) {
      video.current.currentTime = seek.ms / 1000;
      void video.current.play().catch(() => {});
    }
  }, [seek, source]);
  if (!ready)
    return (
      <div className="space-y-3 rounded-lg border border-border p-4 text-sm" aria-live="polite">
        <p>{previewCopy(detail.preview, c)}</p>
        {detail.preview.state === "failed" && detail.preview.failureCode && (
          <p className="text-muted">{detail.preview.failureCode}</p>
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
    );
  return (
    <div className="space-y-2">
      {ended ? (
        <ReviewError code={ended} />
      ) : (
        <video
          ref={video}
          className="aspect-video w-full rounded-lg bg-black"
          controls
          playsInline
          preload="metadata"
          src={source?.url}
          aria-label={c("검토 영상", "Review video")}
          onTimeUpdate={(e) => onTime(Math.round(e.currentTarget.currentTime * 1000))}
          onLoadedMetadata={(e) => {
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
      )}
      {error && <ReviewError code={error} retry={() => void issue(true)} />}
      <p className="text-xs leading-5 text-muted">
        {c(
          "재생 주소는 발급 후 최대 5분(공유는 공유 만료 시각까지만) 유효하며, 만료 전에 현재 권한으로 새 주소를 받아 이어서 재생합니다. 공유 회수나 참여 종료 뒤에는 새 주소가 발급되지 않지만, 이미 발급된 주소는 만료 시각(최대 5분)까지 남을 수 있습니다. 이미 받은 영상 조각은 회수되지 않습니다.",
          "Playback URLs last at most 5 minutes (a share's URL never outlives the share) and are renewed with your current access before they expire. After a revoked share or ended participation no new URL is issued, but an already issued URL can remain usable until it expires (up to 5 minutes). Video already received is not recalled.",
        )}
      </p>
    </div>
  );
}

function Markers({ detail, onSeek }: { detail: ReviewDetail; onSeek: (ms: number) => void }) {
  const c = useCopy();
  const duration = detail.preview.durationMs;
  if (!duration || !detail.comments.length) return null;
  return (
    <div className="relative h-6 rounded bg-surface" aria-label={c("코멘트 위치", "Comment positions")}>
      {detail.comments.map((m) => (
        <button
          key={m.id}
          type="button"
          title={timecode(m.startMs)}
          aria-label={`${c("코멘트 위치로 이동", "Go to comment")} ${timecode(m.startMs)}`}
          className="absolute top-0 h-6 min-w-1 rounded bg-foreground/60"
          style={{
            left: `${(m.startMs / duration) * 100}%`,
            width: m.endMs ? `${Math.max(0.5, ((m.endMs - m.startMs) / duration) * 100)}%` : "4px",
          }}
          onClick={() => onSeek(m.startMs)}
        />
      ))}
    </div>
  );
}

function Comments({
  scope,
  token,
  detail,
  pending,
  now,
  onSeek,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  pending: ReviewRecord[];
  now: React.MutableRefObject<number>;
  onSeek: (ms: number) => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const sending = pending.filter((r) => r.action === "comment" && r.input.round === detail.selectedRound);
  return (
    <section className="space-y-4" aria-label={c("코멘트", "Comments")}>
      <h2 className="font-medium">{c("코멘트", "Comments")}</h2>
      <p className="text-xs text-muted">
        {c(
          "코멘트는 이 회차의 영상 버전과 시각에 고정됩니다. 새 버전에는 옮겨지지 않습니다.",
          "Comments stay with this round's version and time; they never move to a new version.",
        )}
      </p>
      {detail.allowedActions.comment && (
        <Composer scope={scope} token={token} detail={detail} now={now} reload={reload} />
      )}
      {sending.map((r) => (
        <article key={r.input.requestKey} className="rounded-md border border-dashed border-border p-3 text-sm" aria-live="polite">
          <p className="text-xs text-muted">
            {timecode(r.input.startMs as number)} · {c("전송 확인 대기 — 아직 공개되지 않았습니다", "Awaiting confirmation — not published yet")}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words">{r.input.body as string}</p>
        </article>
      ))}
      {detail.comments.length === 0 && !sending.length ? (
        <p className="text-sm text-muted">{c("이 회차에 코멘트가 없습니다.", "No comments in this round.")}</p>
      ) : (
        <ul className="space-y-3">
          {detail.comments.map((m) => (
            <CommentItem key={m.id} scope={scope} token={token} comment={m} onSeek={onSeek} reload={reload} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** Unsent text is a per-account/service/review/round draft on this device;
 * it never shows as a published comment. */
function Composer({
  scope,
  token,
  detail,
  now,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  detail: ReviewDetail;
  now: React.MutableRefObject<number>;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const round = detail.selectedRound;
  const [body, setBody] = useState("");
  const [startMs, setStart] = useState(0);
  const [endMs, setEnd] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draftError, setDraftError] = useState("");
  const mutation = useRun();
  const typed = useRef(false);
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
        .saveDraft(scope, round, body || endMs !== null || startMs ? { body, startMs, endMs } : null)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [scope, round, body, startMs, endMs, loaded]);
  const duration = detail.preview.durationMs ?? 0;
  return (
    <form
      className="space-y-3 rounded-lg border border-border p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = { round, versionId: detail.review.versionId, startMs, endMs, body };
        const done = await mutation.run(input, (requestKey) =>
          reviewsService.mutate(scope, "comment", { requestKey, ...input }, undefined, token),
        );
        // Confirmed, or kept as an unconfirmed record that now carries the
        // original input: either way the text leaves the composer, so it is
        // never sent again under a new key. A definitive rejection keeps it.
        const unconfirmed = (await reviewStore.list(scope).catch(() => [])).some(
          (r) => r.action === "comment" && r.input.body === body && r.input.startMs === startMs,
        );
        if (done || unconfirmed) {
          setBody("");
          setEnd(null);
          await reviewStore.saveDraft(scope, round, null).catch(() => {});
        }
        await reload();
      }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-mono tabular-nums">
          {timecode(startMs)}
          {endMs !== null && ` – ${timecode(endMs)}`}
        </span>
        <button type="button" className={secondaryClass} onClick={() => setStart(Math.min(now.current, Math.max(0, duration - 1)))}>
          {c("현재 위치를 시작으로", "Start at playhead")}
        </button>
        <button
          type="button"
          className={secondaryClass}
          onClick={() => setEnd(now.current > startMs ? Math.min(now.current, duration) : null)}
        >
          {c("현재 위치를 끝으로", "End at playhead")}
        </button>
        {endMs !== null && (
          <button type="button" className={secondaryClass} onClick={() => setEnd(null)}>
            {c("구간 해제", "Clear range")}
          </button>
        )}
      </div>
      <label className="block space-y-2 text-sm">
        <span>{c("코멘트 내용", "Comment text")}</span>
        <textarea
          className={`${inputClass} min-h-24`}
          value={body}
          maxLength={2000}
          disabled={mutation.busy}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted">
        {c("작성 중인 내용은 이 기기에 초안으로 저장되며 공개되지 않습니다.", "Unsent text is kept as a draft on this device and is not published.")}
      </p>
      {draftError && <ReviewError code={draftError} />}
      {mutation.error && <ReviewError code={mutation.error} />}
      <button type="submit" className={primaryClass} disabled={mutation.busy || !body.trim()}>
        {mutation.busy ? c("전송 중", "Sending") : c("코멘트 남기기", "Post comment")}
      </button>
    </form>
  );
}

function CommentItem({
  scope,
  token,
  comment: m,
  onSeek,
  reload,
}: {
  scope: ReviewScope;
  token?: string | null;
  comment: ReviewComment;
  onSeek: (ms: number) => void;
  reload: () => Promise<void>;
}) {
  const c = useCopy();
  const [editing, setEditing] = useState(false),
    [body, setBody] = useState(m.body),
    [converting, setConverting] = useState(false),
    [title, setTitle] = useState(m.body.slice(0, 60)),
    [history, setHistory] = useState(false);
  const mutation = useRun();
  const base = scope.kind === "project" ? `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}` : "";
  return (
    <li className="space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className="font-mono text-xs tabular-nums underline" onClick={() => onSeek(m.startMs)}>
          {timecode(m.startMs)}
          {m.endMs !== null && ` – ${timecode(m.endMs)}`}
        </button>
        <span className="text-xs text-muted">
          {m.author.name ?? c("이름 없음", "Unnamed")} · {kst(m.createdAt)}
          {m.revision > 1 && ` · ${c("수정됨", "Edited")}`}
        </span>
      </div>
      {editing ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = { revision: m.revision, body };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "edit", { requestKey, ...input }, m.id, token),
            );
            if (done) setEditing(false);
            await reload();
          }}
        >
          <textarea className={`${inputClass} min-h-20`} value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <button type="submit" className={primaryClass} disabled={mutation.busy || !body.trim()}>
              {c("수정 저장", "Save edit")}
            </button>
            <button type="button" className={secondaryClass} onClick={() => setEditing(false)}>
              {c("취소", "Cancel")}
            </button>
          </div>
        </form>
      ) : (
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
      )}
      {m.revision > 1 && (
        <button type="button" className="text-xs underline" onClick={() => setHistory((v) => !v)}>
          {c("수정 이력", "Edit history")}
        </button>
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
      {m.request && (
        <p className="text-xs">
          {c("요청으로 전환됨", "Converted to a request")}
          {m.request.title && (
            <>
              {" · "}
              <Link className="underline" href={`${base}/requests/${m.request.requestId}`}>
                {m.request.title}
              </Link>
              {` · ${m.request.state}`}
            </>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {m.canEdit && !editing && (
          <button type="button" className={secondaryClass} onClick={() => setEditing(true)}>
            {c("수정", "Edit")}
          </button>
        )}
        {m.canConvert && !converting && (
          <button type="button" className={secondaryClass} onClick={() => setConverting(true)}>
            {c("요청으로 전환", "Convert to request")}
          </button>
        )}
      </div>
      {converting && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = { revision: m.revision, title };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "convert", { requestKey, ...input }, m.id),
            );
            if (done) setConverting(false);
            await reload();
          }}
        >
          <p className="text-xs text-muted">
            {c(
              "원래 코멘트는 그대로 남고, 코멘트 원문과 영상 버전·시각이 요청 내용에 기록됩니다. 담당자가 아니면 요청 제안으로 등록됩니다.",
              "The comment stays. Its text, version and time go into the request; non-leads create a proposal.",
            )}
          </p>
          <label className="block space-y-1 text-sm">
            <span>{c("요청 제목", "Request title")}</span>
            <input className={inputClass} value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="submit" className={primaryClass} disabled={mutation.busy || !title.trim()}>
            {c("요청 만들기", "Create request")}
          </button>
        </form>
      )}
      {mutation.error && <ReviewError code={mutation.error} />}
      {converting && mutation.error === "B2B_REVIEW_COMMENT_CONVERTED" && (
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
    </li>
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
    <section className="space-y-3 rounded-lg border border-border p-3 text-sm" aria-label={c("영상 승인", "Video approval")}>
      <h2 className="font-medium">{c("영상 승인", "Video approval")}</h2>
      <p className="text-xs text-muted">
        {c(
          "지정된 한 명의 승인자가 이 회차의 영상 버전에 대해서만 승인하거나 수정 요청합니다. 영상 승인은 요청 확인이나 납품 완료를 대신하지 않습니다.",
          "One designated approver approves or requests changes for this round's version only. Approval does not replace request confirmations or delivery.",
        )}
      </p>
      {detail.approval === "approver_inactive" && (
        <p>{c("지정된 승인자의 접근이 끝났습니다. 담당자가 다시 지정해야 합니다.", "The designated approver lost access; the lead must reassign.")}</p>
      )}
      {detail.allowedActions.decide && (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span>{c("사유(수정 요청 시 필수)", "Reason (required for changes)")}</span>
            <textarea className={`${inputClass} min-h-16`} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryClass} disabled={mutation.busy || !reason.trim()} onClick={() => void decide("changes_requested")}>
              {c("수정 요청", "Request changes")}
            </button>
            <button type="button" className={primaryClass} disabled={mutation.busy} onClick={() => void decide("approved")}>
              {c("승인", "Approve")}
            </button>
          </div>
        </div>
      )}
      {current && detail.allowedActions.cancelDecision && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const input = { revision: detail.review.revision, reason: cancelReason };
            const done = await mutation.run(input, (requestKey) =>
              reviewsService.mutate(scope, "cancel", { requestKey, ...input }, current.id, token),
            );
            if (done) setCancelReason("");
            await reload();
          }}
        >
          <label className="block space-y-1">
            <span>{c("결정 취소 사유", "Reason to cancel the decision")}</span>
            <input className={inputClass} value={cancelReason} maxLength={1000} onChange={(e) => setCancelReason(e.target.value)} />
          </label>
          <button type="submit" className={secondaryClass} disabled={mutation.busy || !cancelReason.trim()}>
            {c("결정 취소", "Cancel decision")}
          </button>
        </form>
      )}
      {mutation.error && <ReviewError code={mutation.error} retry={() => void reload()} />}
      {detail.decisions.length > 0 && (
        <ol className="space-y-2 text-xs">
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

function SharedDownload({ scope, token }: { scope: ReviewScope; token: string | null }) {
  const c = useCopy();
  const [error, setError] = useState("");
  const [info, setInfo] = useState<{ size: number; sha256: string } | null>(null);
  return (
    <section className="space-y-2 text-sm">
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
        {c("원본 받기(허용된 공유)", "Download original (allowed by this share)")}
      </button>
      {info && (
        <p className="break-all text-xs text-muted">
          {info.size} bytes · SHA-256 {info.sha256}
        </p>
      )}
      {error && <ReviewError code={error} />}
    </section>
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
    <section className="space-y-8 border-t border-border pt-8" aria-label={c("담당자 관리", "Lead tools")}>
      {detail.allowedActions.setAudience && <AudienceForm key={`audience:${detail.review.revision}`} scope={scope} detail={detail} reload={reload} />}
      {detail.allowedActions.setApprover && <ApproverForm scope={scope} detail={detail} reload={reload} />}
      {detail.allowedActions.replaceVersion && <ReplaceVersion key={`replace:${detail.review.revision}`} scope={scope} detail={detail} reload={reload} />}
      <Shares scope={scope} detail={detail} c={c} />
    </section>
  );
}

function AudienceForm({ scope, detail, reload }: { scope: ReviewScope & { kind: "project" }; detail: ReviewDetail; reload: () => Promise<void> }) {
  const c = useCopy();
  const [audience, setAudience] = useState<AudienceSelection>({ ...projectAudience(detail.approver?.person.userId), audienceUserIds: detail.audience?.map((p) => p.userId) ?? [] });
  const [ready, setReady] = useState(false), [reason, setReason] = useState("");
  const mutation = useRun();
  return <form className="space-y-3" onSubmit={async (e) => {
    e.preventDefault();
    const input = { revision: detail.review.revision, ...audienceInput(audience), reason: reason.trim() };
    const done = await mutation.run(input, (requestKey) => reviewsService.mutate(scope, "audience", { requestKey, ...input }));
    if (done) setReason("");
    await reload();
  }}>
    <h2 className="font-medium">{c("검토 대상 변경", "Change review audience")}</h2>
    <p className="text-sm text-muted">{c("같은 영상도 대상 변경은 새 회차로 공개됩니다. 이전 코멘트·결정은 과거 기록에 남고 새 승인이 필요합니다. 제외한 사람은 새 주소를 발급받을 수 없습니다.", "Audience changes open a new round even for the same video. Earlier comments and decisions remain in history; a fresh approval is required. Removed viewers cannot obtain new playback URLs.")}</p>
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
      className="space-y-3"
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
      <h2 className="font-medium">{c("최종 승인자", "Final approver")}</h2>
      <p className="text-sm text-muted">
        {c(
          "현재 이 검토를 볼 수 있는 한 명만 지정합니다(외부 참여자·공유 수신자 가능). 교체·해제에는 사유가 필요하고 이전 결정은 승계되지 않습니다.",
          "Designate one person who can currently see this review (externals and share recipients allowed). Replacing or clearing needs a reason; earlier decisions do not carry over.",
        )}
      </p>
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
  const [audience, setAudience] = useState<AudienceSelection>(projectAudience);
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
    <section className="space-y-3">
      <h2 className="font-medium">{c("새 영상 버전으로 교체", "Replace with a new version")}</h2>
      <p className="text-sm text-muted">
        {c(
          "새 회차가 열리고 이전 회차의 코멘트·승인은 그 회차에 남습니다. 새 버전의 검토본이 준비된 뒤에만 교체되며, 변환이 실패하면 지금 영상이 유지됩니다.",
          "Opens a new round; earlier comments and decisions stay with their round. Replacement waits for the new review copy; a failed conversion keeps the current video.",
        )}
      </p>
      <button type="button" className={secondaryClass} onClick={() => setOpen((v) => !v)}>
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
    <section className="space-y-4" aria-label={c("검토 공유", "Review sharing")}>
      <h2 className="font-medium">{c("검토 공유", "Review sharing")}</h2>
      <p className="text-sm text-muted">
        {c(
          `공유는 현재 회차 V${detail.rounds.find((r) => r.current)?.ordinal} 영상에 고정되며, 로그인한 지정 이메일 계정만 열 수 있습니다. 기본 유효기간은 7일이고 원본 다운로드는 따로 허용해야 합니다. 링크로 프로젝트의 다른 자료나 업무에 들어갈 수 없습니다.`,
          `A share is fixed to the current round's version and opens only for the signed-in invited accounts. It lasts 7 days by default and original download must be allowed separately. The link reaches nothing else in the project.`,
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
          <label className="block space-y-1 text-sm">
            <span>{c("만료일(비우면 7일 뒤, 한국 시간)", "Expiry date (empty = 7 days, Korea time)")}</span>
            <input type="date" className={inputClass} disabled={!data?.customExpiryMaxDays} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </label>
          <p className="text-sm text-muted">{data?.customExpiryMaxDays ? c(`사용자 지정 만료일은 지금부터 최대 ${data.customExpiryMaxDays}일입니다.`, `Custom expiry may be at most ${data.customExpiryMaxDays} days from now.`) : c("사용자 지정 기간이 설정되지 않아 기본 7일로만 공유할 수 있습니다.", "Custom expiry is not configured; shares use the default 7 days.")}</p>
          {expiry && <button type="button" className={secondaryClass} onClick={() => setExpiry("")}>{c("기본 7일로 공유", "Use the default 7 days")}</button>}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
            {c("원본 다운로드 허용(기본 해제)", "Allow original download (off by default)")}
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
      <ul className="space-y-3">
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
    <div className="space-y-2 rounded-md border border-border p-3 text-sm" aria-live="polite">
      <p>{c("이 링크를 공유받을 사람에게 직접 전달하세요. 링크는 기록에 남기지 않습니다.", "Send this link to the recipients yourself. It is not stored in any log.")}</p>
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
    <li className="space-y-2 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          V{s.ordinal} · {label} · {c("만료", "Expires")} {kst(s.expiresAt)}
          {s.allowDownload && ` · ${c("원본 다운로드 허용", "Original download allowed")}`}
        </span>
      </div>
      <p className="break-all text-xs text-muted">
        {s.recipients.map((r) => `${r.email}${r.ended ? ` (${c("접근 종료", "ended")})` : ""}`).join(", ")}
      </p>
      {s.revoked && <p className="text-xs">{c("회수 사유", "Revoked")}: {s.revoked.reason}</p>}
      {s.state === "active" && (
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className={secondaryClass}
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
          <input className={`${inputClass} max-w-64`} placeholder={c("회수 사유", "Reason to revoke")} value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} aria-label={c("회수 사유", "Reason to revoke")} />
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
      {s.state === "active" && (
        <p className="text-xs text-muted">
          {c("회수 직후 새 재생 주소는 발급되지 않지만, 이미 발급된 주소는 최대 5분 남을 수 있습니다.", "After revocation no new playback URL is issued; an issued one can remain for up to 5 minutes.")}
        </p>
      )}
      {(error || mutation.error) && <ReviewError code={error || mutation.error} />}
    </li>
  );
}
