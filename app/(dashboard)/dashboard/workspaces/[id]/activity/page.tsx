"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type TeamActivity,
} from "@/lib/api/services/workspace.service";
import { activityLabel } from "@/lib/workspaces/activity";
import { TeamShell, secondaryClass } from "@/components/workspaces/shared";
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
  return (
    <TeamShell
      title={lang === "ko" ? "활동 기록" : "Activity"}
      description={data.workspace.name}
    >
      {!data.canManage || !data.managementEnabled ? (
        <CloudError code="PROJECT_PERMISSION_DENIED" />
      ) : (
        <>
          {error && <CloudError code={error} retry={() => load()} />}
          <button
            className={secondaryClass}
            disabled={busy}
            onClick={() => load()}
          >
            {lang === "ko" ? "새로고침" : "Refresh"}
          </button>
          <ol className="divide-y divide-border rounded-xl border border-border px-5">
            {result?.events.map((row) => (
              <li key={row.id} className="space-y-2 py-4">
                <p className="text-sm font-medium">
                  {activityLabel(row.action, lang)}
                </p>
                <p className="break-all text-xs text-muted">
                  {row.actorName || row.actorEmail} ·{" "}
                  {new Date(row.createdAt).toLocaleString(lang)}
                </p>
                {row.detail.userId && (
                  <p className="break-all text-xs text-muted">
                    {lang === "ko" ? "대상" : "Member"}:{" "}
                    {row.targetEmail ||
                      data.members.find((m) => m.userId === row.detail.userId)
                        ?.email ||
                      (lang === "ko" ? "이전 멤버" : "Former member")}
                  </p>
                )}
                {row.projectName && (
                  <p className="break-words text-xs text-muted">
                    {row.projectName}
                  </p>
                )}
              </li>
            ))}
          </ol>
          {result?.events.length === 0 && (
            <p className="text-sm text-muted">
              {lang === "ko"
                ? "아직 활동 기록이 없습니다."
                : "No activity yet."}
            </p>
          )}
          {busy && (
            <p role="status" className="text-sm text-muted">
              {lang === "ko" ? "기록 불러오는 중…" : "Loading activity…"}
            </p>
          )}
          {result?.nextCursor && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => load(result.nextCursor!)}
            >
              {lang === "ko" ? "이전 기록 더 보기" : "Load older activity"}
            </button>
          )}
        </>
      )}
    </TeamShell>
  );
}
