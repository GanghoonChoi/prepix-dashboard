"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { useWorkspaceCapabilities } from "@/components/workspaces/capabilities";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { workspaceError } from "@/lib/workspaces/onboarding";

export default function WorkspacesPage() {
  const { t, lang } = useI18n();
  const { capabilities, loaded } = useWorkspaceCapabilities();
  const [data, setData] = useState<WorkspaceList | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(
    () =>
      workspaceService
        .list()
        .then((next) => {
          setData(next);
          setError("");
        })
        .catch((e) => {
          setError(workspaceError(e));
        }),
    [],
  );
  useEffect(() => {
    if (capabilities?.enabled) void load();
  }, [capabilities?.enabled, load]);
  return (
    <TeamShell title={t("team.indexTitle")} description={t("team.indexDesc")}>
      {!loaded ? (
        <TeamLoading />
      ) : !capabilities?.enabled ? (
        <TeamError code="WORKSPACES_DISABLED" />
      ) : (
        <>
          {error && <TeamError code={error} retry={load} />}
          {!data && !error && <TeamLoading />}
          {data && (
            <>
              {data.invitations.length > 0 && (
                <section className="space-y-3 rounded-xl border border-border bg-surface p-6">
                  <h2 className="font-medium">{t("team.pending")}</h2>
                  <p className="text-sm text-muted">{t("team.pendingDesc")}</p>
                  {data.invitations.map((invite) => (
                    <p key={invite.id} className="text-sm">
                      {invite.workspaceName}{" "}
                      <span className="text-muted">
                        · {t(`team.role.${invite.role}`)}
                      </span>
                    </p>
                  ))}
                </section>
              )}
              <section className="space-y-3">
                <h2 className="text-sm font-medium">{t("team.myTeams")}</h2>
                {data.workspaces.map((workspace) =>
                  workspace.suspendedAt ? (
                    <div
                      key={workspace.id}
                      className="space-y-3 rounded-xl border border-border bg-surface p-5"
                    >
                      <p className="font-medium">{workspace.name}</p>
                      <p className="text-sm text-muted">
                        {lang === "ko"
                          ? "참여가 정지되었습니다. 팀 관리자에게 참여 재개를 요청하세요."
                          : "Your membership is suspended. Ask an administrator to reactivate it."}
                      </p>
                      {workspace.managementEnabled && (
                        <SuspendedLeave
                          id={workspace.id}
                          name={workspace.name}
                          onChange={load}
                        />
                      )}
                    </div>
                  ) : (
                    <Link
                      key={workspace.id}
                      href={`/dashboard/workspaces/${workspace.id}`}
                      className="flex items-center gap-4 rounded-xl border border-border p-5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground"
                    >
                      <Users strokeWidth={1.5} size={22} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{workspace.name}</p>
                        <p className="mt-1 text-sm text-muted">
                          {t(`team.role.${workspace.role}`)} ·{" "}
                          {workspace.onboardingCompletedAt
                            ? t("team.open")
                            : t("team.continueSetup")}
                        </p>
                      </div>
                      <ArrowUpRight
                        strokeWidth={1.5}
                        size={18}
                        aria-hidden="true"
                      />
                    </Link>
                  ),
                )}
                {data.workspaces.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border px-6 py-10">
                    <p className="text-sm">{t("team.empty")}</p>
                    <p className="mt-2 text-sm text-muted">
                      {t("team.inviteHint")}
                    </p>
                  </div>
                )}
              </section>
            </>
          )}
          {capabilities.canCreate && (
            <Link href="/dashboard/workspaces/new" className={primaryClass}>
              {t("team.create")}
            </Link>
          )}
        </>
      )}
      <div>
        <Link href="/dashboard" className={secondaryClass}>
          {t("team.personal")}
        </Link>
      </div>
    </TeamShell>
  );
}

function SuspendedLeave({
  id,
  name,
  onChange,
}: {
  id: string;
  name: string;
  onChange: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      {!open ? (
        <button className={secondaryClass} onClick={() => setOpen(true)}>
          {lang === "ko" ? "워크스페이스 탈퇴" : "Leave workspace"}
        </button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await workspaceService.leave(id);
              await onChange();
            } catch (e) {
              setError(workspaceError(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>
              {lang === "ko"
                ? `팀 자료는 남습니다. 탈퇴하려면 ‘${name}’ 입력`
                : `Team files remain. Type “${name}” to leave`}
            </span>
            <input
              className={inputClass}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </label>
          {error && <TeamError code={error} />}
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={busy || confirm !== name}
            >
              {lang === "ko" ? "탈퇴 확인" : "Confirm leaving"}
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {lang === "ko" ? "취소" : "Cancel"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
