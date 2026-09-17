"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
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
  secondaryClass,
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
  // The repo already has a modal with a focus trap, a scroll lock and an
  // Escape handler. A second one built inline here would be a second set of
  // those behaviours to keep correct.
  const invite = useOverlayState();
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
    <TeamShell>
      {error && <TeamError code={error} retry={load} />}
      <Dialog state={invite} title={c("멤버 초대", "Invite a member")}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const email = inviteEmail.trim();
            if (!email) return;
            void act("invite", async () => {
              const result = await organizationService.inviteMember(
                id,
                email,
                inviteRole,
                lang,
              );
              // Six answers, six sentences. The one that used to be here —
              // "added" for something that had silently done nothing — is the
              // reason this screen could not be trusted.
              setNotice(
                result.status === "invited"
                  ? result.hasAccount
                    ? c(
                        `${email} 님에게 초대 메일을 보냈습니다. 수락하면 팀에 들어옵니다.`,
                        `Invitation sent to ${email}. They join once they accept.`,
                      )
                    : c(
                        `${email} 님에게 초대 메일을 보냈습니다. 아직 Prepix 계정이 없어, 이 주소로 가입한 뒤 팀에 들어옵니다.`,
                        `Invitation sent to ${email}. They have no Prepix account yet, so they will sign up with this address and then join.`,
                      )
                  : result.status === "already_member"
                    ? c("이미 이 팀의 멤버입니다.", "Already a member of this team.")
                    : result.status === "already_invited"
                      ? c(
                          "이미 보낸 초대가 아직 유효합니다. 다시 보내려면 멤버 목록에서 재발송하세요.",
                          "An invitation is already open. Resend it from the list if it did not arrive.",
                        )
                      : result.status === "invalid_email"
                        ? c("이메일 주소를 확인하세요.", "Check the email address.")
                        : result.status === "workspace_required"
                          ? c(
                              "이 조직에 워크스페이스가 여러 개라 어디로 초대할지 정해야 합니다.",
                              "This organisation has more than one workspace, so the invitation needs a team.",
                            )
                          : c(
                              // Never silent. The inviter is the only person
                              // who can notice that a teammate got nothing.
                              `초대는 만들었지만 ${email} 로 메일이 가지 않았습니다. 주소를 확인하고 다시 보내세요.`,
                              `The invitation was created but the email to ${email} did not go out. Check the address and resend.`,
                            ),
              );
              // Only a delivered invitation closes the modal. Every other
              // answer is about the address still in the field, and closing
              // would take away the thing the sentence is talking about.
              if (result.status === "invited") {
                setInviteEmail("");
                invite.close();
              }
            });
          }}
        >
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{c("이메일", "Email")}</span>
            <input
              className={inputClass}
              type="email"
              required
              autoFocus
              maxLength={254}
              placeholder="name@company.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{c("역할", "Role")}</span>
            <select
              className={inputClass}
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
          {notice && (
            <p role="status" className="text-sm leading-6">
              {notice}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className={secondaryClass}
              onClick={() => invite.close()}
              disabled={!!busy}
            >
              {c("취소", "Cancel")}
            </button>
            <button className={primaryClass} disabled={!!busy}>
              {c("초대", "Invite")}
            </button>
          </div>
        </form>
      </Dialog>
      <MembersTable
        title={c("멤버", "Members")}
        description={c(
          "조직에 사람들을 초대하고 역할을 관리하세요.",
          "Invite people to the organisation and manage their roles.",
        )}
        busy={!!busy}
        onInvite={
          data.canManage
            ? () => {
                setNotice("");
                invite.open();
              }
            : undefined
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
