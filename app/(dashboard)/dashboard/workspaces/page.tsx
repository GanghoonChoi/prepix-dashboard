"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { teamStartHref } from "@/lib/onboarding";
import { useRouter } from "next/navigation";
import { ChevronRight, Mail } from "lucide-react";
import {
  Badge,
  Button,
  buttonClass,
  rowClass,
  tableClass,
  tdClass,
  thClass,
} from "@/components/ui";
import { formatDay } from "@/lib/format";
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
} from "@/components/workspaces/shared";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
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
    <TeamShell
      title={t("team.indexTitle")}
      /*
        A TEAM, always — the personal space is provisioned, never created,
        and `remainingCreations` behind `canCreate` counts teams only.
      */
      actions={
        status !== "loading" &&
        status !== "unreachable" &&
        capabilities?.enabled &&
        capabilities.canCreate && (
          <Link href={teamStartHref(lang)} className={buttonClass({ variant: "secondary" })}>
            {t("team.makeTeam")}
          </Link>
        )
      }
    >
      {status === "loading" ? (
        <TeamLoading />
      ) : status === "unreachable" ? (
        // Not the same as "this server has no team product": we never got an
        // answer, so this offers a retry instead of the disabled copy.
        <TeamError code="WORKSPACES_UNREACHABLE" retry={retryCapabilities} />
      ) : !capabilities?.enabled ? (
        /*
          A terminal answer needs a door. With the team product off the sidebar
          drops the switcher — which is the only navigation it has — so this
          page was a message with nothing to click on it and no way back to the
          account's own pages.
        */
        <>
          <TeamError code="WORKSPACES_DISABLED" />
          <Link href="/dashboard" className={buttonClass({ variant: "secondary" })}>
            {t("team.personal")}
          </Link>
        </>
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
                <section className="space-y-3">
                  <h2 className="text-base font-semibold">{t("team.pending")}</h2>
                  <ul className="border-t border-border">
                    {data.invitations.map((invite) => (
                      <li key={invite.id} className={`${spaceGrid} min-h-14 border-b border-border py-2.5`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <IconBox>
                            <Mail size={15} strokeWidth={1.75} aria-hidden="true" />
                          </IconBox>
                          <p className="truncate text-[13px] font-medium">
                            {invite.workspaceName}
                          </p>
                        </div>
                        <p className="hidden truncate text-[13px] text-muted sm:block">
                          {t(`team.role.${invite.role}`)} ·{" "}
                          {t("team.expires", {
                            date: formatDay(invite.expiresAt, lang),
                          })}
                        </p>
                        {/*
                          The list response carries ids but deliberately no
                          tokens, so acceptance goes through the id-addressed
                          route rather than asking the server to hand out
                          tokens it withheld on purpose.
                        */}
                        <Button
                          size="sm"
                          disabled={!!joining}
                          aria-busy={joining === invite.id}
                          onClick={() => void acceptPending(invite.id)}
                        >
                          {t(
                            joining === invite.id
                              ? "team.accepting"
                              : "team.acceptPending",
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {/*
                An empty list is the server lagging behind (every account has
                its personal space), so it is an alert with a retry — not an
                empty state that asks the reader to fix it.
              */}
              {data.workspaces.length === 0 ? (
                <TeamError code="WORKSPACES_EMPTY" retry={load} />
              ) : (
                <Spaces rows={data.workspaces} onChange={load} />
              )}
            </>
          )}
        </>
      )}
    </TeamShell>
  );
}

/** Invitation rows: name | role · expiry | accept. */
const spaceGrid =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]";

function IconBox({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-secondary text-muted">
      {children}
    </span>
  );
}

/**
 * Two kinds, one table (spec D13): the personal space first and shaped like a
 * person, teams below and shaped like a building. An account with only a
 * personal space must not read as an empty team list, so it says what to do
 * under the table instead.
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
  const teams = ordered.filter((row) => !isPersonal(row));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th scope="col" className={thClass}>
                {t("team.col.name")}
              </th>
              <th scope="col" className={`${thClass} hidden w-56 sm:table-cell`}>
                {t("team.col.role")}
              </th>
              <th scope="col" className={`${thClass} w-12`} />
            </tr>
          </thead>
          <tbody>
            {ordered.map((workspace) =>
              workspace.suspendedAt && !isPersonal(workspace) ? (
                <SuspendedSpace
                  key={workspace.id}
                  workspace={workspace}
                  onChange={onChange}
                />
              ) : (
                <SpaceRow key={workspace.id} workspace={workspace} />
              ),
            )}
          </tbody>
        </table>
      </div>
      {teams.length === 0 && (
        <p className="py-4 text-[13px] text-muted">{t("team.personalOne")}</p>
      )}
    </div>
  );
}

function SpaceName({
  personal,
  name,
  muted = false,
}: {
  personal: boolean;
  name: string;
  muted?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <IconBox>
        <SpaceIcon kind={personal ? "personal" : "team"} size={15} />
      </IconBox>
      <span className={`min-w-0 truncate font-medium ${muted ? "text-muted" : ""}`}>
        {name}
      </span>
      {/* Both say their kind: a personal space has its own name now, and
          "<name>의 워크스페이스" with no kind beside it reads like a team. */}
      <Badge>{t(personal ? "team.kind.personal" : "team.kind.team")}</Badge>
    </>
  );
}

function SpaceRow({
  workspace,
}: {
  workspace: WorkspaceList["workspaces"][number];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const spaceName = useSpaceName();
  const personal = isPersonal(workspace);
  const href = `/dashboard/workspaces/${workspace.id}`;
  return (
    // The link is the way in for a keyboard; the row is the same door for a
    // pointer anywhere on it.
    <tr
      className={rowClass}
      onClick={(e) => {
        if (!(e.target as Element).closest("a,button")) router.push(href);
      }}
    >
      <td className={tdClass}>
        <Link
          href={href}
          data-space={personal ? "personal" : "team"}
          className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <SpaceName personal={personal} name={spaceName(workspace)} />
        </Link>
      </td>
      {/*
        A personal space has no role to report — there is nobody to have a
        role relative to — so its cell stays empty.
      */}
      <td className={`${tdClass} hidden text-muted sm:table-cell`}>
        {personal ? (
          "—"
        ) : workspace.onboardingCompletedAt ? (
          t(`team.role.${workspace.role}`)
        ) : (
          <Badge>{t("team.continueSetup")}</Badge>
        )}
      </td>
      <td className={`${tdClass} text-right`}>
        <ChevronRight
          size={15}
          strokeWidth={1.75}
          aria-hidden="true"
          className="inline text-muted"
        />
      </td>
    </tr>
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
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  return (
    <>
      <tr data-space="team">
        <td className={`${tdClass} ${open ? "border-b-0" : ""}`}>
          <div className="flex min-w-0 items-center gap-3">
            <SpaceName personal={false} name={workspace.name} muted />
          </div>
        </td>
        <td className={`${tdClass} hidden sm:table-cell ${open ? "border-b-0" : ""}`}>
          <Badge tone="danger">{t("team.seatSuspended")}</Badge>
        </td>
        <td className={`${tdClass} text-right ${open ? "border-b-0" : ""}`}>
          {workspace.managementEnabled && (
            <div ref={menu} className="flex justify-end">
              <RowMenu>
                <RowMenuItem tone="danger" onClick={() => setOpen(true)}>
                  {lang === "ko" ? "워크스페이스 탈퇴" : "Leave workspace"}
                </RowMenuItem>
              </RowMenu>
            </div>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className={`${tdClass} pb-4`}>
            <SuspendedLeave
              id={workspace.id}
              name={workspace.name}
              onChange={onChange}
              onCancel={() => {
                setOpen(false);
                // Back to the control that opened this, not to <body>.
                menu.current?.querySelector("button")?.focus();
              }}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function SuspendedLeave({
  id,
  name,
  onChange,
  onCancel,
}: {
  id: string;
  name: string;
  onChange: () => Promise<void>;
  onCancel: () => void;
}) {
  const { lang } = useI18n();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="max-w-md space-y-3"
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
      <label className="block space-y-1.5 text-[13px]">
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
        <Button
          type="submit"
          variant="danger"
          size="sm"
          disabled={busy || confirm !== name}
          aria-busy={busy}
        >
          {lang === "ko" ? "탈퇴 확인" : "Confirm leaving"}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          {lang === "ko" ? "취소" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
