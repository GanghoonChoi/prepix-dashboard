"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ReviewApprovalState,
  ReviewPreview,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import { b2bService } from "@/lib/api/services/b2b.service";
import {
  NO_REVIEW,
  origin,
  reviewEvents,
  reviewsService,
} from "@/lib/api/services/b2b-reviews.service";
import type { ReviewScope } from "@/lib/b2b-reviews/operations";
import { fileApi } from "@/lib/b2b-files/api";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, definitivelyRejected, errorCode, useCopy } from "./shared";
import { ReviewPending } from "./review-pending";

// SOT: prepix-backend backend/docs/b2b-reviews.md (S34)
type Copy = [string, string];
export const approvalCopy: Record<ReviewApprovalState, Copy> = {
  no_approver: ["승인자 미지정", "No approver"],
  approver_inactive: ["승인자 재지정 필요", "Approver needs reassignment"],
  awaiting: ["승인 대기", "Awaiting approval"],
  approved: ["승인", "Approved"],
  changes_requested: ["수정 요청", "Changes requested"],
};
const reviewErrors: Record<string, Copy> = {
  B2B_REVIEW_NOT_FOUND: [
    "검토를 찾을 수 없거나 볼 수 있는 범위가 아닙니다.",
    "This review is unavailable to you.",
  ],
  B2B_REVIEW_VERSION_CHANGED: [
    "검토 영상이 새 버전으로 바뀌었습니다. 최신 영상을 확인한 뒤 다시 진행해 주세요. 입력한 내용은 유지했습니다.",
    "The review moved to a new version. Check the latest video and try again; your input is kept.",
  ],
  B2B_REVISION_CONFLICT: [
    "검토가 그 사이 변경되었습니다. 최신 상태를 확인한 뒤 다시 진행해 주세요.",
    "The review changed meanwhile. Check its current state and try again.",
  ],
  B2B_REVIEW_ROUND_CLOSED: [
    "이전 회차는 기록만 볼 수 있습니다.",
    "A previous round is read-only.",
  ],
  B2B_REVIEW_APPROVER_REQUIRED: [
    "지정된 승인자만 이 영상을 승인하거나 수정 요청할 수 있습니다.",
    "Only the designated approver can approve or request changes.",
  ],
  B2B_REVIEW_APPROVER_INVALID: [
    "현재 이 검토에 접근할 수 있는 사람만 승인자로 지정할 수 있습니다.",
    "Only someone with current access to this review can be the approver.",
  ],
  B2B_REVIEW_DECISION_EXISTS: [
    "이 회차에 이미 결정이 있습니다. 바꾸려면 사유와 함께 취소한 뒤 다시 결정해 주세요.",
    "This round already has a decision. Cancel it with a reason before deciding again.",
  ],
  B2B_REVIEW_DECISION_NOT_CURRENT: [
    "현재 유효한 결정이 아닙니다. 최신 상태를 확인해 주세요.",
    "That decision is no longer current. Check the latest state.",
  ],
  B2B_REVIEW_COMMENT_EMPTY: ["코멘트 내용을 입력해 주세요.", "Enter a comment."],
  B2B_REVIEW_RANGE_INVALID: [
    "영상 길이 안의 시작 시각과, 시작보다 뒤인 끝 시각을 지정해 주세요.",
    "Choose a start within the video and an end after the start.",
  ],
  B2B_REVIEW_COMMENT_AUTHOR_REQUIRED: [
    "본인 코멘트만 수정할 수 있습니다.",
    "You can edit only your own comments.",
  ],
  B2B_REVIEW_COMMENT_CONVERTED: [
    "이미 요청으로 전환된 코멘트입니다.",
    "This comment was already converted to a request.",
  ],
  B2B_REVIEW_ASSET_MISMATCH: [
    "같은 자료의 다른 버전만 검토 영상으로 교체할 수 있습니다.",
    "Only another version of the same asset can replace the review video.",
  ],
  B2B_REVIEW_VERSION_UNAVAILABLE: [
    "검토 영상 버전을 지금 사용할 수 없습니다(휴지통 또는 삭제).",
    "This review version is unavailable now (trashed or deleted).",
  ],
  B2B_REVIEW_SHARE_EXPIRED: [
    "공유 기간이 끝났습니다. 담당자에게 새 공유를 요청해 주세요.",
    "This share expired. Ask the lead for a new share.",
  ],
  B2B_REVIEW_SHARE_REVOKED: [
    "이 공유 접근은 종료되었습니다. 담당자에게 문의해 주세요.",
    "Access through this share ended. Contact the lead.",
  ],
  B2B_REVIEW_SHARE_ACCOUNT_MISMATCH: [
    "이 공유를 받은 계정으로 로그인해 주세요.",
    "Sign in with the account this review was shared with.",
  ],
  B2B_REVIEW_SHARE_EMAIL_UNVERIFIED: [
    "이메일 인증을 마친 뒤 공유 검토를 열 수 있습니다.",
    "Verify your email before opening this shared review.",
  ],
  B2B_REVIEW_SHARE_RECIPIENTS_INVALID: [
    "공유받을 사람의 이메일을 1~20개, 중복 없이 입력해 주세요.",
    "Enter 1-20 distinct recipient emails.",
  ],
  B2B_REVIEW_SHARE_EXPIRY_INVALID: [
    "만료일은 지금 이후 30일 안에서 지정해 주세요.",
    "Choose an expiry within the next 30 days.",
  ],
  B2B_REVIEW_SHARE_DOWNLOAD_NOT_ALLOWED: [
    "원본 공유가 허용된 프로젝트에서, 원본을 받을 수 있는 담당자만 원본 다운로드를 허용할 수 있습니다.",
    "Original downloads need a project that allows sharing originals and your own download access.",
  ],
  B2B_REVIEW_SHARE_CONFIGURATION_REQUIRED: [
    "공유 링크 설정이 준비되지 않아 공유를 만들 수 없습니다.",
    "Share links are not configured on this server.",
  ],
  B2B_REVIEW_DOWNLOAD_DENIED: [
    "이 공유에는 원본 다운로드가 허용되지 않았습니다.",
    "This share does not allow original downloads.",
  ],
  B2B_PREVIEW_NOT_READY: [
    "검토본이 아직 준비되지 않았습니다. 준비 상태를 확인해 주세요.",
    "The review copy is not ready yet.",
  ],
  B2B_PREVIEW_UNSUPPORTED: [
    "영상 버전만 검토할 수 있습니다.",
    "Only video versions can be reviewed.",
  ],
  B2B_PREVIEW_SOURCE_UNAVAILABLE: [
    "원본이 휴지통에 있거나 삭제되어 검토본을 재생할 수 없습니다.",
    "The source is trashed or deleted, so the review copy cannot play.",
  ],
  B2B_REASON_REQUIRED: ["사유를 입력해 주세요.", "Enter a reason."],
  B2B_REVIEW_INPUT_INVALID: ["입력 내용을 확인해 주세요.", "Check the entered values."],
  B2B_TEAM_READ_ONLY: [
    "팀 이용 기간이 끝나 기록 열람과 재생만 할 수 있습니다. 새 코멘트·승인·공유는 할 수 없습니다.",
    "The team period ended: you can read and play, but not comment, approve or share.",
  ],
  B2B_TEAM_RECOVERY: [
    "팀이 복구 보관 상태라 검토와 영상을 열 수 없습니다.",
    "The team is in recovery storage; reviews and media are unavailable.",
  ],
};
export function ReviewError({ code, retry }: { code: string; retry?: () => void }) {
  const c = useCopy();
  const message = reviewErrors[code];
  if (!message) return <B2bError code={code} retry={retry} />;
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm leading-6">
      <p>{c(...message)}</p>
      {retry && (
        <button type="button" className={`${secondaryClass} mt-3`} onClick={retry}>
          {c("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}
export const previewCopy = (p: ReviewPreview, c: (ko: string, en: string) => string) =>
  p.state === "ready"
    ? c("검토본 준비됨", "Review copy ready")
    : p.state === "processing"
      ? c("검토본 변환 중", "Converting review copy")
      : p.state === "pending"
        ? c("검토본 변환 대기", "Review copy queued")
        : p.state === "not_requested"
          ? c("검토본 미요청", "Review copy not requested")
          : p.failureCode === "B2B_PREVIEW_SOURCE_REMOVED"
            ? c("원본이 삭제되어 검토본을 만들 수 없습니다", "Source removed; no review copy")
            : p.failureCode?.startsWith("B2B_PREVIEW_SOURCE_")
              ? c("원본 형식·길이·크기 문제로 검토본을 만들지 못했습니다", "The source format, length or size is unsupported")
              : c("검토본 변환에 실패했습니다", "Review copy conversion failed");
export const timecode = (ms: number) => {
  const t = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}.${String(ms % 1000).padStart(3, "0")}`;
};
export const kst = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  });
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-border px-2.5 py-1 text-xs">{children}</span>;
}
export function useTeamScope() {
  const context = useWorkspace()!;
  return {
    team: context.data.workspace.id,
    me: context.data.currentUserId ?? "",
    permitted: !!context.b2b?.enrolled && context.b2b.allowedActions.projects,
  };
}
/** A definitive 4xx clears what was shown; a transient failure keeps the last
 * authorized content and says so. A failed read is never an empty list. */
export function useLoader<T>(read: () => Promise<T>, poll = 15000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false);
  const sequence = useRef(0),
    mounted = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const value = await read();
      if (!mounted.current || ticket !== sequence.current) return;
      setData(value);
      setError("");
      setStale(false);
    } catch (e) {
      if (!mounted.current || ticket !== sequence.current) return;
      setError(errorCode(e));
      if (definitivelyRejected(e)) setData(null);
      else setStale(true);
    }
  }, [read]);
  useEffect(() => {
    mounted.current = true;
    const serial = sequence;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(reviewEvents, refresh);
    const timer = poll ? window.setInterval(refresh, poll) : 0;
    return () => {
      mounted.current = false;
      serial.current++;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(reviewEvents, refresh);
    };
  }, [load, poll]);
  return { data, error, stale, load };
}
/** One request key per intent until a definitive answer, so a lost response
 * is retried with the same key and never applied twice. */
export function useRun() {
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = useCallback(
    async <T,>(intent: object, call: (key: string) => Promise<T>) => {
      const fingerprint = JSON.stringify(intent);
      if (pending.current && pending.current.fingerprint !== fingerprint)
        pending.current = null;
      pending.current ??= { fingerprint, key: crypto.randomUUID() };
      setBusy(true);
      setError("");
      try {
        const result = await call(pending.current.key);
        pending.current = null;
        return result;
      } catch (e) {
        const code = errorCode(e);
        setError(code);
        if (definitivelyRejected(e)) pending.current = null;
        return null;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  return { run, busy, error, setError };
}

/** Video versions of this project the viewer can read, with the selected
 * version's review-copy state. Never shows file names in review views; the
 * picker is the files surface of a lead or producer who can already read them. */
export function VideoVersionPicker({
  scope,
  assetId,
  exclude,
  canPrepare,
  onPick,
  disabled,
  action,
}: {
  scope: ReviewScope & { kind: "project" };
  assetId?: string;
  exclude?: string;
  canPrepare: boolean;
  onPick: (version: TeamFileVersion, preview: ReviewPreview) => void;
  disabled: boolean;
  action: string;
}) {
  const c = useCopy();
  const files = useMemo(() => fileApi({ ...scope }), [scope]);
  const [search, setSearch] = useState("");
  const [versions, setVersions] = useState<TeamFileVersion[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TeamFileVersion | null>(null);
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const list = await files.versions(search);
      setVersions(
        list.versions.filter(
          (v) =>
            v.metadata.video.length > 0 &&
            (!assetId || v.assetId === assetId) &&
            v.id !== exclude,
        ),
      );
      setError("");
    } catch (e) {
      setVersions(null);
      setError(errorCode(e));
    }
  }, [files, search, assetId, exclude]);
  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const status = useCallback(
    async (v: TeamFileVersion) => {
      try {
        setPreview((await reviewsService.previewStatus(scope, v.id)).preview);
        setError("");
      } catch (e) {
        setError(errorCode(e));
      }
    },
    [scope],
  );
  useEffect(() => {
    if (!selected || preview?.state === "ready" || preview?.state === "failed") return;
    const timer = window.setInterval(() => void status(selected), 3000);
    return () => clearInterval(timer);
  }, [selected, preview?.state, status]);
  return (
    <div className="space-y-3">
      <label className="block space-y-2 text-sm">
        <span>{c("영상 버전 검색", "Search video versions")}</span>
        <input
          className={inputClass}
          value={search}
          maxLength={100}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {error && <ReviewError code={error} retry={() => void load()} />}
      {versions === null && !error ? (
        <TeamLoading />
      ) : versions && !versions.length ? (
        <p className="text-sm text-muted">
          {c("선택할 수 있는 영상 버전이 없습니다.", "No selectable video versions.")}
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {versions?.map((v) => (
            <li key={v.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="radio"
                  name={`video-${action}`}
                  checked={selected?.id === v.id}
                  disabled={disabled}
                  onChange={() => {
                    setSelected(v);
                    setPreview(null);
                    void status(v);
                  }}
                />
                <span className="min-w-0 break-all">
                  {v.assetName} · V{v.ordinal}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {selected && preview && (
        <div className="space-y-3 rounded-md border border-border p-3 text-sm" aria-live="polite">
          <p>{previewCopy(preview, c)}</p>
          {canPrepare &&
            (preview.state === "not_requested" ||
              (preview.state === "failed" &&
                preview.failureCode !== "B2B_PREVIEW_SOURCE_REMOVED")) && (
              <button
                type="button"
                className={secondaryClass}
                disabled={disabled || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setPreview(
                      (await reviewsService.preparePreview(scope, selected.id)).preview,
                    );
                  } catch (e) {
                    setError(errorCode(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {preview.state === "failed"
                  ? c("검토본 다시 만들기", "Retry review copy")
                  : c("검토본 만들기", "Prepare review copy")}
              </button>
            )}
          <button
            type="button"
            className={primaryClass}
            disabled={disabled || busy}
            onClick={() => onPick(selected, preview)}
          >
            {action}
          </button>
        </div>
      )}
    </div>
  );
}

export function ProjectReviews({ projectId }: { projectId: string }) {
  const { team, me } = useTeamScope();
  return <ProjectReviewsInner key={`${origin()}:${team}:${me}:${projectId}`} projectId={projectId} />;
}
function ProjectReviewsInner({ projectId }: { projectId: string }) {
  const c = useCopy();
  const router = useRouter();
  const { team, me, permitted } = useTeamScope();
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [creating, setCreating] = useState(false),
    [title, setTitle] = useState("");
  const scope = useMemo<ReviewScope & { kind: "project" }>(
    () => ({ origin: origin(), userId: me, kind: "project", workspaceId: team, projectId, reviewId: NO_REVIEW }),
    [team, projectId, me],
  );
  const read = useCallback(async () => {
    const [project, list] = await Promise.all([
      b2bService.project(team, projectId),
      reviewsService.list(scope, { search: query, cursor }),
    ]);
    return { project: project.project, list };
  }, [team, projectId, scope, query, cursor]);
  const { data, error, stale, load } = useLoader(read);
  const mutation = useRun();
  if (!permitted || !me) return <B2bError code="B2B_PROJECT_NOT_FOUND" />;
  if (!data) return error ? <ReviewError code={error} retry={() => void load()} /> : <TeamLoading />;
  const { project, list } = data;
  const base = `/dashboard/workspaces/${team}/projects/${projectId}`;
  return (
    <TeamShell title={c("영상 검토", "Video reviews")} description={project.name}>
      <ReviewPending scope={scope} />
      {stale && <ReviewError code={error} retry={() => void load()} />}
      <div className="flex flex-wrap gap-3">
        <Link className={secondaryClass} href={base}>
          {c("프로젝트 개요", "Project overview")}
        </Link>
        {list.allowedActions.create && (
          <button type="button" className={primaryClass} onClick={() => setCreating((v) => !v)}>
            {c("새 검토", "New review")}
          </button>
        )}
      </div>
      {creating && list.allowedActions.create && (
        <section className="space-y-4 rounded-lg border border-border p-4" aria-label={c("새 검토", "New review")}>
          <p className="text-sm text-muted">
            {c(
              "선택한 정확한 영상 버전으로 검토를 시작합니다. 프로젝트 참여자에게 공개되며 원본 다운로드 권한은 바뀌지 않습니다. 업로드만으로 검토가 시작되지 않습니다.",
              "Starts a review of the exact version you pick, visible to project participants. Download access does not change; uploads never start reviews on their own.",
            )}
          </p>
          <label className="block space-y-2 text-sm">
            <span>{c("검토 제목", "Review title")}</span>
            <input className={inputClass} value={title} maxLength={100} disabled={mutation.busy} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <VideoVersionPicker
            scope={scope}
            canPrepare
            disabled={mutation.busy}
            action={c("이 버전으로 검토 시작", "Start review with this version")}
            onPick={async (version) => {
              const input = { title: title.trim(), versionId: version.id };
              const made = await mutation.run(input, (requestKey) =>
                reviewsService.mutate(scope, "create", { requestKey, ...input }),
              );
              if (made) router.push(`${base}/reviews/${made.review.id}`);
            }}
          />
          {mutation.error && <ReviewError code={mutation.error} />}
        </section>
      )}
      <form
        className="flex w-full min-w-0 gap-2 sm:w-auto"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor(undefined);
          setQuery(search.trim());
        }}
      >
        <input
          className={`${inputClass} min-w-0 max-w-64`}
          aria-label={c("검토 검색", "Search reviews")}
          placeholder={c("검토 제목 검색", "Search review titles")}
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="submit" className={`${secondaryClass} shrink-0`}>
          {c("검색", "Search")}
        </button>
      </form>
      {list.reviews.length === 0 ? (
        <p className="text-sm text-muted">
          {query ? c("검색 결과가 없습니다.", "No matching reviews.") : c("아직 검토가 없습니다.", "No reviews yet.")}
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {list.reviews.map((r) => (
            <li key={r.id}>
              <Link href={`${base}/reviews/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-surface">
                <span className="min-w-0">
                  <span className="block font-medium break-words">{r.title}</span>
                  <span className="mt-1 block text-sm text-muted">
                    {c("현재", "Current")} V{r.ordinal} · {c("회차", "Round")} {r.round}
                    {r.previousRounds > 0 && ` · ${c("이전 검토", "Previous rounds")} ${r.previousRounds}`}
                    {r.approver && ` · ${c("승인자", "Approver")} ${r.approver.name ?? c("이름 없음", "Unnamed")}`}
                  </span>
                </span>
                <Badge>{c(...approvalCopy[r.approval])}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        {cursor && (
          <button type="button" className={secondaryClass} onClick={() => setCursor(undefined)}>
            {c("처음으로", "First page")}
          </button>
        )}
        {list.nextCursor && (
          <button type="button" className={secondaryClass} onClick={() => setCursor(list.nextCursor!)}>
            {c("다음", "Next")}
          </button>
        )}
      </div>
    </TeamShell>
  );
}
