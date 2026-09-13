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
        setError(cloudErrorCode(e));
        setData(null);
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
  if (!data)
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <Link
          className="inline-flex min-h-11 items-center text-sm underline"
          href="/dashboard/workspaces"
        >
          {lang === "ko" ? "워크스페이스로 돌아가기" : "Back to workspaces"}
        </Link>
        {error ? (
          <CloudError code={error} retry={reload} />
        ) : (
          <p role="status">
            {lang === "ko" ? "워크스페이스 불러오는 중…" : "Loading workspace…"}
          </p>
        )}
      </div>
    );
  return (
    <Context.Provider value={{ data, reload, cloudEnabled }}>
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
  const links = [
    ["", "홈", "Home"],
    ["/members", "멤버", "Members"],
    ...(cloudEnabled ? [["/projects", "프로젝트", "Projects"]] : []),
    ["/plan", "플랜과 사용량", "Plan and usage"],
    ...(data.managementEnabled
      ? [
          ["/settings", "설정", "Settings"],
          ...(data.canManage ? [["/activity", "활동 기록", "Activity"]] : []),
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
