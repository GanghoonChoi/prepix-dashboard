"use client";
import Link from "next/link";
import {
  Fragment,
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
import { b2bService, type B2bStatus } from "@/lib/api/services/b2b.service";
import { isPersonal } from "@/lib/workspaces/kind";
import { cloudService } from "@/lib/api/services/cloud.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { secondaryClass, TeamLoading } from "./shared";
import { SearchX } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { contentGone } from "@/lib/workspaces/errors";
import { apiClient } from "@/lib/api/client";
import {
  accountMoved,
  pinMutationAccount,
  readApiSession,
} from "@/lib/api/session";
const Context = createContext<{
  data: WorkspaceDetail;
  reload: () => Promise<void>;
  cloudEnabled: boolean;
  b2b: B2bStatus | null;
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
  const { lang } = useI18n();
  const [data, setData] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [b2b, setB2b] = useState<B2bStatus | null>(null);
  const serial = useRef(0);
  // Who the loaded view belongs to. It survives dropping the view so a burst of
  // storage events (lineage, tokens, actor) keeps restarting the load until the
  // last write has landed.
  const viewOwner = useRef<{ userId: string | null; lineage: string | null } | null>(null);
  useEffect(() => {
    const account = data?.currentUserId ?? null;
    pinMutationAccount(account);
    return () => pinMutationAccount(null);
  }, [data]);
  const reload = useCallback(async () => {
    const request = ++serial.current;
    const base = apiClient.defaults.baseURL!;
    const loadedLineage = readApiSession(base).lineage;
    try {
      const next = await workspaceService.detail(id);
      const status = isPersonal(next.workspace) ? { enabled: false, enrolled: false } as const : await b2bService.status(id).catch((e) => {
        // Older servers have no B2B route. Network failures keep the last
        // response and are surfaced instead of silently reopening old UI.
        if (e?.response?.status === 404) return { enabled: false, enrolled: false } as const;
        throw e;
      });
      if (request === serial.current) {
        viewOwner.current = { userId: next.currentUserId ?? null, lineage: loadedLineage };
        setB2b(status);
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
    const changed = () => void reload();
    window.addEventListener("workspaces:changed", changed);
    // Another tab signed in as someone else (or again): this view's children
    // and their in-memory intents belong to the old session. Drop them now,
    // not at the next poll, then load the new account's view.
    const moved = () => {
      const owner = viewOwner.current;
      if (
        !owner ||
        !accountMoved(apiClient.defaults.baseURL!, owner.userId, owner.lineage)
      )
        return;
      serial.current++;
      setData(null);
      setB2b(null);
      void reload();
    };
    window.addEventListener("storage", moved);
    return () => {
      alive = false;
      window.clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("workspaces:changed", changed);
      window.removeEventListener("storage", moved);
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
        {/* Not (or no longer) a member: the same "can't open this" screen as
            every other refusal, with the way back instead of a retry. */}
        {error === "WORKSPACE_NOT_FOUND" ? (
          <div role="alert" data-testid="access-denied" className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-surface-secondary text-muted">
              <SearchX size={20} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-semibold tracking-tight">{lang === "ko" ? "열 수 없습니다" : "Can't open this"}</h2>
            <p className="text-[13px] leading-6 text-muted">
              {lang === "ko"
                ? "이 워크스페이스의 멤버가 아니거나 참여가 끝났습니다."
                : "You are not a member of this workspace, or your access ended."}
            </p>
            <Link className={`${secondaryClass} mt-2`} href="/dashboard/workspaces">
              {lang === "ko" ? "워크스페이스 목록으로" : "All workspaces"}
            </Link>
          </div>
        ) : error ? (
          <CloudError code={error} retry={reload} />
        ) : (
          <TeamLoading />
        )}
      </div>
    );
  return (
    <Context.Provider value={{ data, reload, cloudEnabled: cloudEnabled && (!b2b?.enrolled || b2b.team.legacyArchive), b2b }}>
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
      {/* Another account is another view: its in-memory intents (pending
          request keys, drafts) never carry over. Same account keeps them. */}
      <Fragment key={data.currentUserId}>{children}</Fragment>
    </Context.Provider>
  );
}
