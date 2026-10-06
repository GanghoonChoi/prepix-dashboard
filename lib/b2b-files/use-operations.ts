"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileApi, fileError, type FileScope } from "./api";
import {
  BrowserMutationStore,
  checkMutation,
  mutationKey,
  operationProject,
  runMutation,
  type FileMutation,
} from "./mutations";

export function useFileOperations(
  scope: FileScope,
  active: boolean,
  changed: () => void,
) {
  const store = useMemo(() => new BrowserMutationStore(), []);
  const [pending, setPending] = useState<FileMutation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const enabled = useRef(active),
    controller = useRef<AbortController | null>(null),
    reader = useRef<AbortController | null>(null);
  enabled.current = active;
  const apiFor = useCallback(
    (r: FileMutation) => fileApi({ ...scope, projectId: operationProject(r) }),
    [scope],
  );
  const refresh = useCallback(async () => {
    if (!enabled.current || controller.current) return;
    reader.current?.abort();
    const abort = new AbortController();
    reader.current = abort;
    try {
      let rows = await store.list(scope);
      abort.signal.throwIfAborted();
      for (const row of rows) {
        if (controller.current) break;
        const receipt = await checkMutation(
          row,
          apiFor(row),
          store,
          abort.signal,
        );
        if (receipt && enabled.current) {
          setConfirmed(true);
          changed();
        }
      }
      rows = await store.list(scope);
      abort.signal.throwIfAborted();
      if (enabled.current) {
        setPending(rows);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && enabled.current) setError(fileError(e));
    }
  }, [store, scope, apiFor, changed]);
  useEffect(() => {
    if (!active) {
      controller.current?.abort();
      reader.current?.abort();
      return;
    }
    const start = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const interval = window.setInterval(onFocus, 15000);
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      reader.current?.abort();
      controller.current?.abort();
    };
  }, [active, refresh]);
  const run = useCallback(
    async (r: FileMutation) => {
      if (!enabled.current || controller.current) return false;
      reader.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setBusy(true);
      setError("");
      setConfirmed(false);
      try {
        await runMutation(r, apiFor(r), store, abort.signal);
        if (enabled.current) {
          setConfirmed(true);
          changed();
        }
        return true;
      } catch (e) {
        if (!abort.signal.aborted && enabled.current) setError(fileError(e));
        return false;
      } finally {
        controller.current = null;
        setBusy(false);
        if (enabled.current) {
          setPending(await store.list(scope).catch(() => []));
        }
      }
    },
    [apiFor, changed, store, scope],
  );
  return {
    pending: active ? pending : [],
    error: active ? error : "",
    busy,
    confirmed: active && confirmed,
    run,
    refresh,
    key: mutationKey,
    invalidate: changed,
  };
}
