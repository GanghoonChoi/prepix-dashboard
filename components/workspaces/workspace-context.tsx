"use client";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { cloudService } from "@/lib/api/services/cloud.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { TeamLoading } from "./shared";
import { contentGone } from "@/lib/workspaces/errors";
const Context = createContext<{
  data: WorkspaceDetail;
  reload: () => Promise<void>;
  cloudEnabled: boolean;
} | null>(null);
export function useWorkspace() {
  return useContext(Context);
}
export function WorkspaceProvider({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const [data, setData] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const serial = useRef(0);
  const reload = useCallback(async () => {
    const request = ++serial.current;
    try {
      const next = await workspaceService.detail(id);
      if (request === serial.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (request === serial.current) {
        const code = cloudErrorCode(e);
        setError(code);
        // Keep the last good workspace. This runs on the 30s poll and on every
        // window focus, so clearing it here unmounts every child — a half-typed
        // invitation list included — the moment wifi blinks. Only a code that
        // says the workspace itself is gone may empty the screen (§5.1).
        if (contentGone(code)) setData(null);
      }
    }
  }, [id]);
  useEffect(() => {
    const initial = window.setTimeout(() => void reload(), 0);
    let alive = true;
    void cloudService
      .capabilities(id)
      .then((caps) => {
        if (alive) setCloudEnabled(caps.enabled);
      })
      .catch(() => {
        if (alive) setCloudEnabled(false);
      });
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [id, reload]);
  // Loading keeps the structure (§5.1): the back link, the header block and the
  // nav rail stay where they are and only the content is a skeleton, so the
  // page does not jump when the workspace arrives.
  if (!data)
    // Loading looks like what is coming. It used to paint a back link, a
    // "팀 미리보기" eyebrow and a tab rail — three pieces of chrome the loaded
    // page no longer has, so the screen rearranged itself on arrival.
    return (
      <div className="text-foreground">
        {error ? <CloudError code={error} retry={reload} /> : <TeamLoading />}
      </div>
    );
  return (
    <Context.Provider value={{ data, reload, cloudEnabled }}>
      {/*
        A failed refresh is a banner over the page that is already there, never
        a replacement for it. Children — and their in-progress input — stay
        mounted.
      */}
      {error && (
        <div className="mb-6">
          <CloudError code={error} retry={reload} />
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
