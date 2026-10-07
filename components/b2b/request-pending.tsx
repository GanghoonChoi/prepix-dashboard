"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BrowserRequestStore,
  checkRequest,
  requestsApi,
  requestEvents,
  runRequest,
  requestKey,
  type RequestRecord,
  type RequestScope,
} from "@/lib/b2b-requests/operations";
import { secondaryClass } from "@/components/workspaces/shared";
import { B2bError, errorCode, useCopy } from "./shared";
export function RequestPending({ scope }: { scope: RequestScope }) {
  const c = useCopy(),
    store = useMemo(() => new BrowserRequestStore(), []),
    api = useMemo(() => requestsApi(scope), [scope]);
  const [rows, setRows] = useState<RequestRecord[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState<string>();
  const reader = useRef<AbortController | null>(null),
    mounted = useRef(false),
    writer = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (writer.current) return;
    reader.current?.abort();
    const abort = new AbortController();
    reader.current = abort;
    try {
      const records = await store.list(scope);
      abort.signal.throwIfAborted();
      if (mounted.current) setRows(records);
      for (const r of records) {
        abort.signal.throwIfAborted();
        const receipt = await checkRequest(r, api, store, abort.signal);
        if (receipt && mounted.current) {
          setConfirmed(receipt.request.id);
          window.dispatchEvent(
            new CustomEvent(requestEvents, { detail: scope }),
          );
        }
      }
      const pending = await store.list(scope);
      abort.signal.throwIfAborted();
      if (mounted.current) {
        setRows(pending);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && mounted.current) setError(errorCode(e));
    }
  }, [store, scope, api]);
  useEffect(() => {
    mounted.current = true;
    const start = window.setTimeout(() => void refresh(), 0),
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 15000);
    const focus = () => void refresh();
    const changed = (event: Event) => {
      if (
        (event as CustomEvent<RequestScope>).detail &&
        requestKey((event as CustomEvent<RequestScope>).detail) ===
          requestKey(scope)
      )
        void refresh();
    };
    window.addEventListener("focus", focus);
    window.addEventListener(requestEvents, changed);
    return () => {
      mounted.current = false;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener(requestEvents, changed);
      reader.current?.abort();
      writer.current?.abort();
    };
  }, [refresh, scope]);
  const retry = async (r: RequestRecord) => {
    if (writer.current) return;
    reader.current?.abort();
    const abort = new AbortController();
    writer.current = abort;
    setBusy(true);
    setError("");
    try {
      const result = await runRequest(r, api, store, abort.signal);
      if (mounted.current) {
        setConfirmed(result.request.id);
        window.dispatchEvent(new CustomEvent(requestEvents, { detail: scope }));
      }
    } catch (e) {
      if (!abort.signal.aborted && mounted.current) setError(errorCode(e));
    } finally {
      writer.current = null;
      if (mounted.current) {
        setBusy(false);
        void refresh();
      }
    }
  };
  return (
    <section
      className="space-y-3"
      aria-label={c("요청 변경 결과", "Request operation results")}
    >
      {error && <B2bError code={error} retry={() => void refresh()} />}
      {confirmed && (
        <p role="status" className="text-sm">
          {c(
            "원래 요청의 변경 결과를 확인했습니다.",
            "The original request operation was confirmed.",
          )}{" "}
          <Link
            className="underline"
            href={`/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/requests/${confirmed}`}
          >
            {c("확인한 요청 열기", "Open confirmed request")}
          </Link>
        </p>
      )}
      {rows.map((r) => (
        <div
          key={r.input.requestKey}
          className="space-y-3 rounded-lg border border-border p-4 text-sm"
        >
          <p>
            {c(
              "응답을 확인하지 못한 요청 변경이 있습니다. 원래 입력과 요청 키를 보존했습니다.",
              "A request reply is unconfirmed. Its original input and key are preserved.",
            )}
          </p>
          <button
            className={secondaryClass}
            disabled={busy}
            onClick={() => void retry(r)}
          >
            {c("요청 원요청 확인·재시도", "Check or retry original request")}
          </button>
        </div>
      ))}
    </section>
  );
}
