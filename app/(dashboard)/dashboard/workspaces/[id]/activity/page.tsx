"use client";
import { AccessDenied } from "@/components/b2b/shared";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type TeamActivity,
} from "@/lib/api/services/workspace.service";
import { activityLabel } from "@/lib/workspaces/activity";
import {
  EmptyState,
  TeamLoading,
  TeamShell,
  secondaryClass,
} from "@/components/workspaces/shared";
import {
  CloudError,
  cloudErrorCode,
} from "@/components/workspaces/cloud-shared";
export default function Page() {
  const { data } = useWorkspace()!;
  const { lang } = useI18n();
  const [result, setResult] = useState<TeamActivity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (cursor?: string) => {
      setBusy(true);
      try {
        const next = await workspaceService.activity(data.workspace.id, cursor);
        setResult((prev) =>
          cursor && prev
            ? {
                ...next,
                events: [
                  ...prev.events,
                  ...next.events.filter(
                    (row) => !prev.events.some((p) => p.id === row.id),
                  ),
                ],
              }
            : next,
        );
        setError("");
      } catch (e) {
        setError(cloudErrorCode(e));
      } finally {
        setBusy(false);
      }
    },
    [data.workspace.id],
  );
  useEffect(() => {
    if (data.canManage && data.managementEnabled) void load();
  }, [load, data.canManage, data.managementEnabled]);
  const allowed = data.canManage && data.managementEnabled;
  return (
    <TeamShell
      title={lang === "ko" ? "활동 기록" : "Activity"}
      actions={
        allowed && (
          <button
            className={secondaryClass}
            disabled={busy}
            onClick={() => load()}
          >
            {lang === "ko" ? "새로고침" : "Refresh"}
          </button>
        )
      }
    >
      {!data.managementEnabled ? (
        <CloudError code="WORKSPACE_MANAGEMENT_DISABLED" />
      ) : !allowed ? (
        <AccessDenied code="B2B_TEAM_MANAGER_REQUIRED" />
      ) : (
        <>
          {error && <CloudError code={error} retry={() => load()} />}
          {!result && !error && <TeamLoading />}
          {result && result.events.length === 0 && (
            <EmptyState
              title={
                lang === "ko" ? "아직 활동 기록이 없습니다." : "No activity yet."
              }
            />
          )}
          {!!result?.events.length && (
            <ol className="divide-y divide-border rounded-lg border border-border">
              {result.events.map((row) => (
                <li key={row.id} className="px-5 py-3">
                  <p className="text-sm font-medium">
                    {activityLabel(row.action, lang)}
                  </p>
                  <p className="mt-0.5 break-all text-xs text-muted">
                    {/* No actor means the system acted. Falling through to an
                        empty string would print a bare separator and read as a
                        rendering bug rather than a fact about the entry. */}
                    {row.actorName ||
                      row.actorEmail ||
                      (lang === "ko" ? "시스템" : "System")}{" "}
                    · {new Date(row.createdAt).toLocaleString(lang)}
                    {row.detail.userId &&
                      ` · ${lang === "ko" ? "대상" : "Member"}: ${
                        row.targetEmail ||
                        data.members.find((m) => m.userId === row.detail.userId)
                          ?.email ||
                        (lang === "ko" ? "이전 멤버" : "Former member")
                      }`}
                    {row.projectName && ` · ${row.projectName}`}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {result?.nextCursor && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => load(result.nextCursor!)}
            >
              {busy
                ? lang === "ko"
                  ? "기록 불러오는 중…"
                  : "Loading activity…"
                : lang === "ko"
                  ? "이전 기록 더 보기"
                  : "Load older activity"}
            </button>
          )}
        </>
      )}
    </TeamShell>
  );
}
