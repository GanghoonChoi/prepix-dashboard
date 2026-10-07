"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkReview,
  discardReview,
  runReview,
  scopeKey,
  type ReviewRecord,
  type ReviewScope,
} from "@/lib/b2b-reviews/operations";
import {
  reviewApi,
  reviewEvents,
  reviewStore,
} from "@/lib/api/services/b2b-reviews.service";
import { secondaryClass } from "@/components/workspaces/shared";
import { definitivelyRejected, errorCode, useCopy } from "./shared";
import { ReviewError } from "./reviews";

const actionCopy: Record<ReviewRecord["action"], [string, string]> = {
  create: ["검토 시작", "Start review"],
  round: ["영상 교체", "Replace video"],
  approver: ["승인자 지정", "Designate approver"],
  audience: ["검토 대상 변경", "Change review audience"],
  decide: ["승인 결정", "Decision"],
  cancel: ["결정 취소", "Cancel decision"],
  comment: ["코멘트", "Comment"],
  edit: ["코멘트 수정", "Edit comment"],
  convert: ["요청 전환", "Convert to request"],
  share: ["검토 공유", "Share"],
  revoke: ["공유 회수", "Revoke share"],
  resolve: ["코멘트 완료 표시", "Mark comment done"],
};

/** Unconfirmed changes of this account/service/access path. Automatic checks
 * only read; a retry re-sends the original input with the original key. */
export function ReviewPending({
  scope,
  token,
  currentRound,
  onConfirmed,
}: {
  scope: ReviewScope;
  token?: string | null;
  /** Round of the review now; discarded comment text returns to its draft. */
  currentRound?: number;
  onConfirmed?: () => void;
}) {
  const c = useCopy();
  const api = useMemo(() => reviewApi(scope, token), [scope, token]);
  const [rows, setRows] = useState<ReviewRecord[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dead, setDead] = useState<string[]>([]);
  const mounted = useRef(false);
  // Unsent comment text goes back to the draft, never lost. A comment is tied
  // to its version's timeline, so a new round gets the text only, not the old
  // time range.
  const keepDraft = useCallback(
    async (r: ReviewRecord) => {
      if (r.action !== "comment" || typeof r.input.body !== "string") return;
      const same = currentRound === undefined || currentRound === r.input.round;
      const round = same ? (r.input.round as number) : currentRound;
      const kept = await reviewStore.draft(r.scope, round).catch(() => null);
      await reviewStore.saveDraft(r.scope, round, {
        body: kept?.body ? `${kept.body}\n${r.input.body}` : r.input.body,
        startMs: kept?.body ? kept.startMs : same ? (r.input.startMs as number) : 0,
        endMs: kept?.body ? kept.endMs : same ? ((r.input.endMs as number | null) ?? null) : null,
      });
    },
    [currentRound],
  );
  const refresh = useCallback(async () => {
    const abort = new AbortController();
    try {
      const records = await reviewStore.list(scope);
      let confirmed = false;
      for (const r of records)
        confirmed = !!(await checkReview(r, api, reviewStore, abort.signal)) || confirmed;
      const left = await reviewStore.list(scope);
      if (!mounted.current) return;
      setRows(left);
      setError("");
      if (confirmed) {
        onConfirmed?.();
        window.dispatchEvent(new CustomEvent(reviewEvents, { detail: scope }));
      }
    } catch (e) {
      if (mounted.current) setError(errorCode(e));
    }
  }, [scope, api, onConfirmed]);
  useEffect(() => {
    mounted.current = true;
    const start = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<ReviewScope>).detail;
      if (detail && scopeKey(detail) === scopeKey(scope)) void refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener(reviewEvents, changed);
    return () => {
      mounted.current = false;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(reviewEvents, changed);
    };
  }, [refresh, scope]);
  if (!rows.length && !error) return null;
  return (
    <section
      className="space-y-3 rounded-lg border border-border px-4 py-3 text-sm"
      aria-label={c("결과 확인이 필요한 변경", "Changes awaiting confirmation")}
      aria-live="polite"
    >
      <div>
        <h2 className="font-medium">{c("결과 확인이 필요한 변경", "Changes awaiting confirmation")}</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {c("응답을 받지 못했습니다. 다시 보내도 두 번 적용되지 않습니다.", "No response arrived. Retrying never applies a change twice.")}
        </p>
      </div>
      {error && <ReviewError code={error} />}
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={`${r.action}:${r.target ?? ""}`} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <span>
              {c(...actionCopy[r.action])}
              {typeof r.input.body === "string" && ` · ${r.input.body.slice(0, 60)}`}
            </span>
            <span className="flex flex-wrap gap-2">
              <button type="button" className={secondaryClass} disabled={busy} onClick={() => void refresh()}>
                {c("결과 확인", "Check result")}
              </button>
              <button
                type="button"
                className={secondaryClass}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    // A refusal the original-key lookup proves unapplied frees
                    // the record (shared rule); its text returns to the draft.
                    await runReview(r, api, reviewStore, new AbortController().signal, () => keepDraft(r));
                  } catch (e) {
                    setError(errorCode(e));
                    // Refused but not freed (the lookup could not answer):
                    // the person may discard it explicitly.
                    if (definitivelyRejected(e))
                      setDead((d) => [...new Set([...d, r.input.requestKey])]);
                  } finally {
                    setBusy(false);
                    void refresh();
                    // The draft and the review may have changed either way.
                    window.dispatchEvent(new CustomEvent(reviewEvents, { detail: scope }));
                  }
                }}
              >
                {c("같은 내용으로 다시 보내기", "Retry the same change")}
              </button>
              {dead.includes(r.input.requestKey) && (
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const dropped = await discardReview(r, api, reviewStore, new AbortController().signal);
                      if (dropped) await keepDraft(r);
                      setDead((d) => d.filter((k) => k !== r.input.requestKey));
                      setError("");
                    } catch (e) {
                      setError(errorCode(e));
                    } finally {
                      setBusy(false);
                      void refresh();
                      window.dispatchEvent(new CustomEvent(reviewEvents, { detail: scope }));
                    }
                  }}
                >
                  {c("이 변경 버리기", "Discard this change")}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
