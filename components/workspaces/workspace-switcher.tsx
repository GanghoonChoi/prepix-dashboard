"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
export function WorkspaceSwitcher({ onClose }: { onClose?: () => void }) {
  const { lang } = useI18n();
  const path = usePathname();
  const router = useRouter();
  const [teams, setTeams] = useState<WorkspaceList["workspaces"]>([]);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setTeams(
        (await workspaceService.list()).workspaces.filter(
          (w) => !w.suspendedAt,
        ),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    window.addEventListener("focus", load);
    window.addEventListener("workspaces:changed", load);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", load);
      window.removeEventListener("workspaces:changed", load);
    };
  }, [load, path]);
  const id = path.match(
    /^\/dashboard\/workspaces\/([a-f0-9-]{36})(?:\/|$)/,
  )?.[1];
  return (
    <div className="space-y-2 border-b border-border px-4 py-4">
      <label
        htmlFor="workspace-context"
        className="block text-[11px] text-muted"
      >
        {lang === "ko" ? "현재 공간" : "Current space"}
      </label>
      <select
        id="workspace-context"
        className="min-h-11 w-full min-w-0 rounded-md border border-border bg-field-background px-2 text-sm text-foreground"
        value={
          id && teams.some((w) => w.id === id)
            ? id
            : path.startsWith("/dashboard/workspaces")
              ? "teams"
              : "personal"
        }
        onChange={(e) => {
          router.push(
            e.target.value === "personal"
              ? "/dashboard"
              : e.target.value === "teams"
                ? "/dashboard/workspaces"
                : `/dashboard/workspaces/${e.target.value}`,
          );
          onClose?.();
        }}
      >
        <option value="personal">
          {lang === "ko" ? "개인 공간" : "Personal space"}
        </option>
        <option value="teams">
          {lang === "ko" ? "워크스페이스 목록" : "All workspaces"}
        </option>
        {teams.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {failed && (
        <button className="min-h-11 text-left text-xs underline" onClick={load}>
          {lang === "ko" ? "팀 목록 다시 불러오기" : "Retry team list"}
        </button>
      )}
      <Link
        className="inline-flex min-h-11 items-center text-xs text-muted hover:text-foreground"
        href="/dashboard/workspaces"
        onClick={onClose}
      >
        {lang === "ko" ? "워크스페이스 관리" : "Manage workspaces"}
      </Link>
    </div>
  );
}
