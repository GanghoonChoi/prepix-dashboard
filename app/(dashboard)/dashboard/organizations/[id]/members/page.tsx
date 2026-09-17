"use client";
import { use, useCallback, useEffect, useState } from "react";
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
import { RoleGuide } from "@/components/workspaces/role-guide";
import {
  MembersTable,
  type MemberRow,
} from "@/components/workspaces/members-table";
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
  "editor",
  "reviewer",
];

function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");
  /**
   * Two places a result can be announced, because they have different
   * lifetimes. `notice` is on the page and outlives the modal — it is where a
   * SUCCESS goes, since success closes the modal and a message written into a
   * closing component is a message nobody reads. `formNotice` is inside the
   * modal, for the answers that keep the field so the sentence can talk about
   * the address still sitting in it.
   */
  const [notice, setNotice] = useState("");
  const [formNotice, setFormNotice] = useState("");
  const [busy, setBusy] = useState("");
  // The repo already has a modal with a focus trap, a scroll lock and an
  // Escape handler. A second one built inline here would be a second set of
  // those behaviours to keep correct.
  const invite = useOverlayState();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] =
    useState<Exclude<OrganizationRole, "owner">>("editor");

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
        editor: c("편집자", "Editor"),
        reviewer: c("검토자", "Reviewer"),
      })[role],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang],
  );

  // Every assignable role is assignable by every manager now that the one a
  // manager could not hand out is gone.
  const assignable = ASSIGNABLE;

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
              const message =
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
                        : result.status === "no_workspace"
                          ? c(
                              "이 팀에 아카이브가 없습니다. 먼저 팀을 만드세요.",
                              "This team has no archive yet. Create a team first.",
                            )
                          : result.status === "delivery_failed"
                                ? c(
                                  // Never silent. The inviter is the only
                                  // person who can notice a teammate got
                                  // nothing.
                                  `초대는 만들었지만 ${email} 로 메일이 가지 않았습니다. 주소를 확인하고 다시 보내세요.`,
                                  `The invitation was created but the email to ${email} did not go out. Check the address and resend.`,
                                )
                              : c(
                                  // An answer we do not have a sentence for.
                                  // A catch-all that ASSERTS a specific
                                  // failure is worse than one that admits it
                                  // does not know: this branch used to claim
                                  // "the mail did not go out" for a server
                                  // that had neither created anything nor
                                  // tried to send, which sent somebody
                                  // checking an address that was never the
                                  // problem.
                                  // Cast because the union is exhaustive at
                                  // compile time and this branch exists for
                                  // RUNTIME: a server on a different version
                                  // is the normal state of this app, not an
                                  // impossible one.
                                  `초대를 처리하지 못했습니다 (${(result as { status: string }).status}). 잠시 후 다시 시도하세요.`,
                                  `The invitation could not be completed (${(result as { status: string }).status}). Try again shortly.`,
                                );
              // Only a delivered invitation closes the modal. Every other
              // answer is about the address still in the field, and closing
              // would take away the thing the sentence is talking about — so
              // it stays in the modal, and the success goes to the page.
              if (result.status === "invited") {
                setFormNotice("");
                setNotice(message);
                setInviteEmail("");
                invite.close();
              } else {
                setFormNotice(message);
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
          {formNotice && (
            <p role="status" className="text-sm leading-6">
              {formNotice}
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
        /*
          Every row below is a rule `organizations.service.ts` enforces, not a
          summary of intent: MANAGES = owner|admin gates invite, role changes
          and rename; SEES_BILLING = owner gates the billing screen; the owner
          row is immutable and ownership moves through transfer, which asks for
          a password; reviewers never reach the archive and hold no seat. The
          row that used to explain a translation between two vocabularies is
          gone with the translation.

          A permissions table that is merely plausible is worse than none —
          people plan around it, and the first refusal that disagrees with it
          costs the screen its credibility.
        */
        roleGuide={
          <RoleGuide
            title={c("역할별 권한", "What each role can do")}
            columns={(
              ["owner", "admin", "editor", "reviewer"] as OrganizationRole[]
            ).map(
              (role) => ({ key: role, label: roleLabel(role) }),
            )}
            rows={[
              {
                label: c(
                  "멤버 초대 · 역할 변경 · 내보내기",
                  "Invite, change roles, remove",
                ),
                values: [true, true, false, false],
              },
              {
                label: c("팀 이름 변경", "Rename the team"),
                values: [true, true, false, false],
              },
              {
                label: c("결제 정보 보기", "See billing"),
                values: [true, false, false, false],
                note: c(
                  "관리자는 결제를 보지 못합니다. 팀을 운영하는 것과 카드를 쥐는 것은 다른 일입니다.",
                  "An admin runs the team without being handed the card.",
                ),
              },
              {
                label: c(
                  "아카이브 원본 업로드 · 다운로드",
                  "Upload and download originals",
                ),
                values: [true, true, true, false],
                note: c(
                  "검토자는 아카이브에 접근하지 않습니다.",
                  "A reviewer does not reach the archive at all.",
                ),
              },
              {
                label: c("좌석 사용", "Uses a paid seat"),
                values: [true, true, true, false],
                note: c("검토자는 좌석을 쓰지 않습니다.", "Reviewers are free."),
              },
              {
                label: c("소유권", "Ownership"),
                values: [true, false, false, false],
                note: c(
                  "소유자는 역할 변경이나 내보내기로 바꿀 수 없습니다. 소유권 이전은 비밀번호 확인을 거칩니다.",
                  "The owner cannot be demoted or removed here; transfer asks for a password.",
                ),
              },
            ]}
            footnote={c(
              "조직에서 내보내면 이 조직의 모든 워크스페이스에서도 함께 빠집니다.",
              "Removing somebody from the organisation removes them from every workspace under it.",
            )}
          />
        }
        notice={notice}
        onDismissNotice={() => setNotice("")}
        // Members only. The table also lists people who have been invited and
        // have not answered, and counting them here would overstate the team.
        count={data.members.length}
        description={c(
          "조직에 사람들을 초대하고 역할을 관리하세요.",
          "Invite people to the organisation and manage their roles.",
        )}
        busy={!!busy}
        onInvite={
          data.canManage
            ? () => {
                setFormNotice("");
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
        rows={data.members.map((member): MemberRow => {
          // Only the owner moves anybody in or out of billing, so an admin
          // Your own row is text too: you do not demote yourself by misclicking
          // a dropdown. The clause that used to be here — an admin cannot touch
          // a `billing` row — went with the role it protected.
          const locked =
            member.role === "owner" ||
            member.userId === data.currentUserId ||
            !data.canManage;
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
        })
        /**
         * Invitations sit in the same table as members, below them.
         *
         * They were nowhere at all: you invited somebody, the modal said the
         * mail went, and then they appeared on no screen — not a member,
         * because they had not accepted, and not anything else. A separate
         * "pending" panel would have been a second roster to read; one list
         * answers "who is in this team, and who is on the way".
         */
        .concat(
          (data.invitations ?? []).map((invitation): MemberRow => ({
            id: invitation.id,
            name: null,
            badge: c("초대됨", "Invited"),
            email: invitation.email,
            role: invitation.role ?? "editor",
            roleLabel: roleLabel(
              (invitation.role ?? "editor") as OrganizationRole,
            ),
            detail:
              invitation.deliveryStatus === "failed"
                ? c("메일 발송 실패", "Delivery failed")
                : new Date(invitation.expiresAt) < new Date()
                  ? c("초대 만료됨", "Invitation expired")
                  : c(
                      `초대함 · ${new Date(invitation.expiresAt).toLocaleDateString(lang)} 만료`,
                      `Invited · expires ${new Date(invitation.expiresAt).toLocaleDateString(lang)}`,
                    ),
            // A role dropdown on somebody who has not joined would be editing
            // a promise. Change it by revoking and inviting again.
            locked: true,
            menu: data.canManage ? (
              <RowMenu>
                <RowMenuItem
                  disabled={!!busy}
                  onClick={() =>
                    void act(invitation.id, async () => {
                      const result =
                        await organizationService.resendInvitation(
                          id,
                          invitation.id,
                          lang,
                        );
                      setNotice(
                        result.status === "invited"
                          ? c(
                              `${invitation.email} 로 다시 보냈습니다.`,
                              `Sent again to ${invitation.email}.`,
                            )
                          : result.status === "retry_later"
                            ? c(
                                "방금 보냈습니다. 1분 뒤에 다시 시도하세요.",
                                "Just sent. Try again in a minute.",
                              )
                            : c(
                                "다시 보내지 못했습니다.",
                                "Could not send it again.",
                              ),
                      );
                    })
                  }
                >
                  {c("초대 다시 보내기", "Resend invitation")}
                </RowMenuItem>
                <RowMenuItem
                  tone="danger"
                  disabled={!!busy}
                  onClick={() =>
                    void act(invitation.id, async () => {
                      await organizationService.revokeInvitation(id, invitation.id);
                      setNotice(
                        c(
                          `${invitation.email} 초대를 취소했습니다.`,
                          `Invitation to ${invitation.email} revoked.`,
                        ),
                      );
                    })
                  }
                >
                  {c("초대 취소", "Revoke invitation")}
                </RowMenuItem>
              </RowMenu>
            ) : undefined,
          })),
        )}
      />
    </TeamShell>
  );
}
