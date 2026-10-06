"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileError } from "./api";
import {
  BrowserStewardStore,
  checkSteward,
  runSteward,
  stewardApi,
  type StewardRecord,
  type StewardScope,
} from "./stewards";
export function useStewardOperations(scope: StewardScope, changed: () => void) {
  const { origin, userId, workspaceId } = scope;
  const fixedScope = useMemo(
    () => ({ origin, userId, workspaceId }),
    [origin, userId, workspaceId],
  );
  const api = useMemo(() => stewardApi(fixedScope), [fixedScope]),
    store = useMemo(() => new BrowserStewardStore(), []);
  const [pending, setPending] = useState<StewardRecord[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const changedRef = useRef(changed),
    writer = useRef<AbortController | null>(null),
    reader = useRef<AbortController | null>(null),
    mounted = useRef(false);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  const refresh = useCallback(async () => {
    if (writer.current) return;
    reader.current?.abort();
    const abort = new AbortController();
    reader.current = abort;
    try {
      for (const r of await store.list(fixedScope)) {
        abort.signal.throwIfAborted();
        if (await checkSteward(r, api, store, abort.signal)) {
          setConfirmed(true);
          changedRef.current();
        }
      }
      const rows = await store.list(fixedScope);
      abort.signal.throwIfAborted();
      if (mounted.current) {
        setPending(rows);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && mounted.current) setError(fileError(e));
    }
  }, [api, store, fixedScope]);
  useEffect(() => {
    mounted.current = true;
    const initial = window.setTimeout(() => void refresh(), 0),
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      mounted.current = false;
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      writer.current?.abort();
      reader.current?.abort();
    };
  }, [refresh]);
  const run = useCallback(
    async (r: StewardRecord) => {
      if (writer.current || !mounted.current) return false;
      reader.current?.abort();
      const abort = new AbortController();
      writer.current = abort;
      setBusy(true);
      setError("");
      setConfirmed(false);
      try {
        await runSteward(r, api, store, abort.signal);
        abort.signal.throwIfAborted();
        if (mounted.current) {
          setConfirmed(true);
          changedRef.current();
        }
        return true;
      } catch (e) {
        if (!abort.signal.aborted && mounted.current) setError(fileError(e));
        return false;
      } finally {
        writer.current = null;
        if (mounted.current) {
          setBusy(false);
          try {
            setPending(await store.list(fixedScope));
          } catch (e) {
            setError(fileError(e));
          }
        }
      }
    },
    [api, store, fixedScope],
  );
  return {
    api,
    scope: fixedScope,
    pending,
    busy,
    error,
    confirmed,
    run,
    refresh,
  };
}
