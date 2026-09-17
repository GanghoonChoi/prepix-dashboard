"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  organizationService,
  type OrganizationDetail,
  type OrganizationRole,
} from "@/lib/api/services/organization.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { MembersTable } from "@/components/workspaces/members-table";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  inputClass,
  primaryClass,
} from "@/components/workspaces/shared";

/**
 * The people in the company.
 *
 * Its own route because the sidebar entry is called 멤버: sending that to a
 * settings page that also renamed the organisation and listed its workspaces
 * made the label and the destination disagree, which is a small lie the reader
 * has to correct every time.
 */
export default function OrganizationMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}

const ASSIGNABLE: Exclude<OrganizationRole, "owner">[] = [
  "admin",
  "billing",
  "member",
];

function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Exclude<OrganizationRole, "owner">>("member");

  const load = useCallback(async () => {
    try {
      setData(await organizationService.detail(id));
      setError("");
    } catch (e) {
      setError(workspaceError(e));
    }
  }, [id]);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  async function act(key: string, run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await run();
      await load();
    } catch (e) {
      setError(workspaceError(e));
    } finally {
      setBusy("");
    }
  }

  const roleLabel = useCallback(
    (role: OrganizationRole) =>
      ({
        owner: c("소유자", "Owner"),
        admin: c("관리자", "Admin"),
        billing: c("결제", "Billing"),
        member: c("멤버", "Member"),
      })[role],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  // Only the owner hands out the card, so an admin is never offered it.
  const assignable = useMemo(
    () => ASSIGNABLE.filter((r) => r !== "billing" || data?.role === "owner"),
    [data?.role],
  );

  if (error && !data) return <TeamError code={error} retry={load} />;
  if (!data) return <TeamLoading />;

  return (
    <TeamShell title={c("멤버", "Members")}>
      {error && <TeamError code={error} retry={load} />}
      {inviting && data.canManage && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const email = inviteEmail.trim();
            if (!email) return;
            void act("invite", async () => {
              const result = await organizationService.addMember(
                id,
                email,
                inviteRole,
              );
              // Three outcomes, three sentences. "Added" that silently did
              // nothing is the worst of them.
              setNotice(
                result.status === "added"
                  ? result.joinedWorkspace
                    ? c(
                        `${email} 추가됨 · 아카이브에도 들어갔습니다`,
                        `${email} added, and joined the archive`,
                      )
                    : c(`${email} 추가됨`, `${email} added`)
                  : result.status === "already_member"
                    ? c("이미 이 조직의 멤버입니다.", "Already a member.")
                    : c(
                        "아직 가입하지 않은 이메일입니다. 워크스페이스 초대를 보내면 메일로 안내됩니다.",
                        "No account yet. A workspace invitation will email them.",
                      ),
              );
              if (result.status === "added") {
                setInviteEmail("");
                setInviting(false);
              }
            });
          }}
        >
          <label className="block flex-1 space-y-2 text-sm">
            <span>{c("이메일", "Email")}</span>
            <input
              className={inputClass}
              type="email"
              required
              maxLength={254}
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span>{c("역할", "Role")}</span>
            <select
              className={inputClass.replace("w-full", "w-40")}
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(
                  event.target.value as Exclude<OrganizationRole, "owner">,
                )
              }
            >
              {assignable.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
          </label>
          <button className={primaryClass} disabled={!!busy}>
            {c("추가", "Add")}
          </button>
        </form>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <MembersTable
        title={c("멤버", "Members")}
        description={c(
          "조직에 사람들을 초대하고 역할을 관리하세요.",
          "Invite people to the organisation and manage their roles.",
        )}
        busy={!!busy}
        onInvite={
          data.canManage ? () => setInviting((was) => !was) : undefined
        }
        roleFilters={(["owner", ...assignable] as OrganizationRole[]).map(
          (role) => ({ value: role, label: roleLabel(role) }),
        )}
        footnote={
          data.canManage
            ? c(
                "내보내면 이 조직의 모든 워크스페이스에서도 함께 빠집니다.",
                "Removing someone also takes them out of every workspace here.",
              )
            : undefined
        }
        rows={data.members.map((member) => {
          // Only the owner moves anybody in or out of billing, so an admin
          // sees those rows as text rather than a control the server would
          // refuse. Your own row is text too: you do not demote yourself by
          // misclicking a dropdown.
          const locked =
            member.role === "owner" ||
            member.userId === data.currentUserId ||
            !data.canManage ||
            (data.role !== "owner" && member.role === "billing");
          return {
            id: member.userId,
            name: member.name,
            email: member.email,
            role: member.role,
            roleLabel: roleLabel(member.role),
            locked,
            roleOptions: assignable.map((role) => ({
              value: role,
              label: roleLabel(role),
            })),
            onRole: (role: string) =>
              void act(member.userId, () =>
                organizationService.changeMember(
                  id,
                  member.userId,
                  role as Exclude<OrganizationRole, "owner">,
                ),
              ),
            menu: locked ? undefined : (
              <RowMenu>
                <RowMenuItem
                  tone="danger"
                  disabled={!!busy}
                  onClick={() =>
                    void act(member.userId, () =>
                      organizationService.changeMember(
                        id,
                        member.userId,
                        "remove",
                      ),
                    )
                  }
                >
                  {c("조직에서 내보내기", "Remove from organisation")}
                </RowMenuItem>
              </RowMenu>
            ),
          };
        })}
      />

    </TeamShell>
  );
}
