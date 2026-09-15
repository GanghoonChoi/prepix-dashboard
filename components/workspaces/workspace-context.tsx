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
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { cloudService } from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { contentGone } from "@/lib/workspaces/errors";
import { isPersonal } from "@/lib/workspaces/kind";
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
  const { lang } = useI18n();
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
    return (
      <div className="mx-auto max-w-4xl space-y-8 text-foreground">
        <Link
          className="inline-flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline"
          href="/dashboard/workspaces"
        >
          {lang === "ko" ? "워크스페이스" : "Workspaces"}
        </Link>
        <header>
          <p className="mb-3 text-xs font-medium text-muted">
            {lang === "ko" ? "팀 미리보기" : "Team preview"}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {lang === "ko" ? "워크스페이스" : "Workspace"}
          </h1>
        </header>
        <div
          aria-hidden="true"
          className="h-11 border-b border-border"
          data-skeleton="nav"
        />
        {error ? (
          <CloudError code={error} retry={reload} />
        ) : (
          <>
            <p role="status" className="text-sm text-muted">
              {lang === "ko"
                ? "워크스페이스 불러오는 중…"
                : "Loading workspace…"}
            </p>
            <div aria-hidden="true" className="space-y-3">
              <div className="h-24 rounded-xl border border-border bg-surface" />
              <div className="h-40 rounded-xl border border-border bg-surface" />
            </div>
          </>
        )}
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
        <div className="mx-auto mb-6 max-w-4xl">
          <CloudError code={error} retry={reload} />
        </div>
      )}
      {children}
    </Context.Provider>
  );
}
export function WorkspaceNav() {
  const context = useWorkspace();
  const pathname = usePathname();
  const { lang } = useI18n();
  if (!context) return null;
  const { data, cloudEnabled } = context;
  const base = `/dashboard/workspaces/${data.workspace.id}`;
  /**
   * A personal space has no team chrome — not disabled, absent (spec D13 §2.3).
   * Members, seats, roles and the audit trail are all statements about other
   * people, and there are no other people here. Nothing to invite into is
   * nothing to invite into by mistake, which is the whole guardrail.
   */
  const personal = isPersonal(data.workspace);
  const links = [
    ["", "홈", "Home"],
    ...(personal ? [] : [["/members", "멤버", "Members"]]),
    ...(cloudEnabled ? [["/media", "아카이브", "Archive"]] : []),
    ["/plan", "플랜과 사용량", "Plan and usage"],
    ...(data.managementEnabled
      ? [
          ["/settings", "설정", "Settings"],
          ...(data.canManage && !personal
            ? [["/activity", "활동 기록", "Activity"]]
            : []),
        ]
      : []),
  ];
  return (
    <nav
      aria-label={lang === "ko" ? "워크스페이스 메뉴" : "Workspace navigation"}
      className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border"
    >
      {links.map(([path, ko, en]) => {
        const active = path
          ? pathname.startsWith(base + path)
          : pathname === base;
        return (
          <Link
            key={path}
            href={base + path}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center border-b-2 text-sm ${active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {lang === "ko" ? ko : en}
          </Link>
        );
      })}
    </nav>
  );
}
