"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
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
  SpaceIcon,
  useSpaceName,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";

export default function WorkspacesPage() {
  const { t, lang } = useI18n();
  const {
    capabilities,
    status,
    reload: retryCapabilities,
  } = useWorkspaceCapabilities();
  const router = useRouter();
  const [data, setData] = useState<WorkspaceList | null>(null);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState("");
  const load = useCallback(
    () =>
      workspaceService
        .list()
        .then((next) => {
          setData(next);
          setError("");
        })
        .catch((e) => {
          // Keep whatever list is already on screen; this is a banner, not a
          // teardown (§5.1).
          setError(workspaceError(e));
        }),
    [],
  );
  useEffect(() => {
    if (capabilities?.enabled) void load();
  }, [capabilities?.enabled, load]);
  async function acceptPending(invitationId: string) {
    if (joining) return;
    setJoining(invitationId);
    setError("");
    try {
      const { workspaceId } = await workspaceService.acceptPending(invitationId);
      router.push(`/dashboard/workspaces/${workspaceId}`);
    } catch (e) {
      setError(workspaceError(e));
      setJoining("");
    }
  }
  return (
    <TeamShell title={t("team.indexTitle")}>
      {status === "loading" ? (
        <TeamLoading />
      ) : status === "unreachable" ? (
        // Not the same as "this server has no team product": we never got an
        // answer, so this offers a retry instead of the disabled copy.
        <TeamError code="WORKSPACES_UNREACHABLE" retry={retryCapabilities} />
      ) : !capabilities?.enabled ? (
        <TeamError code="WORKSPACES_DISABLED" />
      ) : (
        <>
          {error && <TeamError code={error} retry={load} />}
          {!data && !error && <TeamLoading />}
          {data && (
            <>
              {/*
                No verification prompt here: it is rendered above every
                dashboard page from the account's own `emailVerified`. An
                unverified user gets an empty `invitations` list, so this
                section simply does not appear for them.
              */}
              {data.invitations.length > 0 && (
                <section className="space-y-3 rounded-xl border border-border bg-surface p-6">
                  <h2 className="font-medium">{t("team.pending")}</h2>
                  <p className="text-sm text-muted">{t("team.pendingDesc")}</p>
                  <ul className="divide-y divide-border">
                    {data.invitations.map((invite) => (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0">
                          <p className="break-words text-sm">
                            {invite.workspaceName}{" "}
                            <span className="text-muted">
                              · {t(`team.role.${invite.role}`)}
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {t("team.expires", {
                              date: new Date(
                                invite.expiresAt,
                              ).toLocaleDateString(lang),
                            })}
                          </p>
                        </div>
                        {/*
                          The list response carries ids but deliberately no
                          tokens, so acceptance goes through the id-addressed
                          route rather than asking the server to hand out
                          tokens it withheld on purpose.
                        */}
                        <button
                          className={secondaryClass}
                          disabled={!!joining}
                          onClick={() => void acceptPending(invite.id)}
                        >
                          {t(
                            joining === invite.id
                              ? "team.accepting"
                              : "team.acceptPending",
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Spaces rows={data.workspaces} onChange={load} />
              {data.workspaces.length === 0 && (
                <TeamError code="WORKSPACES_EMPTY" retry={load} />
              )}
            </>
          )}
          {/*
            A TEAM, always — the personal space is provisioned, never created,
            and `remainingCreations` behind `canCreate` counts teams only. First
            run is /start; by the time anyone reads this the account already has
            its personal space, so this is secondary.
          */}
          {capabilities.canCreate && (
            <Link href="/dashboard/workspaces/new" className={secondaryClass}>
              {t("team.makeTeam")}
            </Link>
          )}
        </>
      )}
    </TeamShell>
  );
}

/**
 * Two kinds, two sections (spec D13). Personal first and shaped like a person;
 * teams below and shaped like a building. An account with only a personal space
 * must not read as an empty team list — it reads as "this is your space", which
 * is the sentence under the Teams heading when that section is empty.
 */
function Spaces({
  rows,
  onChange,
}: {
  rows: WorkspaceList["workspaces"];
  onChange: () => Promise<void>;
}) {
  const { t } = useI18n();
  const ordered = personalFirst(rows);
  const personal = ordered.filter(isPersonal);
  const teams = ordered.filter((row) => !isPersonal(row));
  return (
    <>
      {personal.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">{t("team.spaceHeading")}</h2>
          {personal.map((workspace) => (
            <SpaceCard key={workspace.id} workspace={workspace} />
          ))}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-sm font-medium">{t("team.teamsHeading")}</h2>
        {teams.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-5 text-sm leading-6 text-muted">
            {t("team.personalOne")}
          </p>
        ) : (
          teams.map((workspace) =>
            workspace.suspendedAt ? (
              <SuspendedSpace
                key={workspace.id}
                workspace={workspace}
                onChange={onChange}
              />
            ) : (
              <SpaceCard key={workspace.id} workspace={workspace} />
            ),
          )
        )}
      </section>
    </>
  );
}

function SpaceCard({
  workspace,
}: {
  workspace: WorkspaceList["workspaces"][number];
}) {
  const { t } = useI18n();
  const spaceName = useSpaceName();
  const personal = isPersonal(workspace);
  return (
    <Link
      href={`/dashboard/workspaces/${workspace.id}`}
      data-space={personal ? "personal" : "team"}
      className="flex items-center gap-4 rounded-xl border border-border p-5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground"
    >
      <SpaceIcon kind={personal ? "personal" : "team"} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{spaceName(workspace)}</p>
        {/*
          A personal space has no role to report — there is nobody to have a
          role relative to — so it says what it is instead. What is NOT here
          any more is "워크스페이스 열기": a row that is a link does not also
          need a sentence saying it opens when clicked.
        */}
        <p className="mt-1 text-sm text-muted">
          {personal
            ? t("team.kind.personal")
            : workspace.onboardingCompletedAt
              ? t(`team.role.${workspace.role}`)
              : t("team.continueSetup")}
        </p>
      </div>
      <ArrowUpRight strokeWidth={1.5} size={18} aria-hidden="true" />
    </Link>
  );
}

/**
 * Only a team can suspend you, so only a team gets this. Leaving a personal
 * workspace is not a thing the product has.
 */
function SuspendedSpace({
  workspace,
  onChange,
}: {
  workspace: WorkspaceList["workspaces"][number];
  onChange: () => Promise<void>;
}) {
  const { lang } = useI18n();
  return (
    <div
      data-space="team"
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
          onChange={onChange}
        />
      )}
    </div>
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
  const trigger = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      {!open ? (
        <button
          ref={trigger}
          className={secondaryClass}
          onClick={() => setOpen(true)}
        >
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
              onClick={() => {
                setOpen(false);
                // Back to the control that opened this, not to <body>.
                trigger.current?.focus();
              }}
            >
              {lang === "ko" ? "취소" : "Cancel"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
