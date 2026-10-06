"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  checkReview,
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
import { errorCode, useCopy } from "./shared";
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
};

/** Unconfirmed changes of this account/service/access path. Automatic checks
 * only read; a retry re-sends the original input with the original key. */
export function ReviewPending({
  scope,
  token,
  onConfirmed,
}: {
  scope: ReviewScope;
  token?: string | null;
  onConfirmed?: () => void;
}) {
  const c = useCopy();
  const api = useMemo(() => reviewApi(scope, token), [scope, token]);
  const [rows, setRows] = useState<ReviewRecord[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const mounted = useRef(false);
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
      className="space-y-3 rounded-lg border border-border p-4 text-sm"
      aria-label={c("결과 확인이 필요한 변경", "Changes awaiting confirmation")}
      aria-live="polite"
    >
      <h2 className="font-medium">{c("결과 확인이 필요한 변경", "Changes awaiting confirmation")}</h2>
      <p className="text-muted">
        {c(
          "응답을 받지 못한 변경입니다. 같은 요청으로만 확인·재시도하므로 두 번 적용되지 않습니다.",
          "No response arrived for these changes. They are checked and retried with the same request, so they never apply twice.",
        )}
      </p>
      {error && <ReviewError code={error} />}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={`${r.action}:${r.target ?? ""}`} className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {c(...actionCopy[r.action])}
              {typeof r.input.body === "string" && ` · ${r.input.body.slice(0, 60)}`}
            </span>
            <span className="flex gap-2">
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
                    await runReview(r, api, reviewStore, new AbortController().signal);
                  } catch (e) {
                    setError(errorCode(e));
                  } finally {
                    setBusy(false);
                    void refresh();
                  }
                }}
              >
                {c("같은 내용으로 다시 보내기", "Retry the same change")}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
