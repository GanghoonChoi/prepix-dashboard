"use client";
import { useEffect, useState } from "react";
import { useOverlayState } from "@heroui/react";
import Link from "next/link";
import { Dialog } from "@/components/dialog";
import { useWorkspace } from "./workspace-context";
import { MemberActions } from "@/components/workspaces/member-actions";
import { MembersTable } from "@/components/workspaces/members-table";
import { RoleGuide } from "@/components/workspaces/role-guide";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { useI18n } from "@/lib/i18n/context";
import { workspaceService } from "@/lib/api/services/workspace.service";
import { invitationStatus, workspaceError } from "@/lib/workspaces/onboarding";
import { seatFigures } from "@/lib/workspaces/kind";
import { InviteForm } from "@/components/workspaces/invite-form";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  SeatBreakdown,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

export function MembersContent({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const context = useWorkspace()!;
  const data = context.data;
  const load = context.reload;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeId, setRevokeId] = useState("");
  /*
    Inviting is a modal, not a panel on the page.

    It was a `<details>` above the table, which cost the table its place: with a
    seat panel and an expanded invite form stacked on top, the roster started
    roughly a thousand pixels down and the first screen of a MEMBERS page had
    no members on it. A modal costs nothing until it is opened.
  */
  const inviteDialog = useOverlayState();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    const refresh = () => {
      void load();
    };
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function action(key: string, run: () => Promise<unknown>) {
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
  /*
    First-run setup, and only for the person doing the first run.

    This was `canManage`, so an admin invited into a team whose owner had never
    pressed "설정 완료" arrived at a 1-2-3 wizard for a team they had just
    joined — and could finish somebody else's setup. The creator is who the
    steps are addressed to.
  */
  const setup =
    data?.canManage &&
    !data.workspace.onboardingCompletedAt &&
    data.workspace.createdBy === data.currentUserId;
  // Pending invitations sit in the same table as members; MembersTable owns
  // the searching and filtering across both.
  const visibleInvites = (data?.invitations ?? []).filter(
    (invite) => !invite.acceptedAt,
  );
  const visibleMembers = (data?.members ?? [])
    .slice()
    .sort(
      (a, b) =>
        Number(!!a.suspendedAt) * 10 +
        { owner: 0, admin: 1, editor: 2, reviewer: 3 }[a.role] -
        (Number(!!b.suspendedAt) * 10 +
          { owner: 0, admin: 1, editor: 2, reviewer: 3 }[b.role]),
    );
  return (
    <TeamShell
      /*
        No page title outside first-run setup. The table carries its own
        heading, so a 멤버 above 멤버와 초대 was the same word twice and a line
        the roster paid for in position. During setup the team's name is the
        orientation, so it stays.
      */
      title={setup ? (data?.workspace.name ?? t("team.title")) : undefined}
      /* Only first-run setup needs a line of orientation. Once the table is
         on screen it says what this page is better than a sentence can. */
      description={setup ? t("team.inviteDesc") : undefined}
    >
      {error && <TeamError code={error} retry={load} />}
      {!data && !error && <TeamLoading />}
      {data && (
        <>
          {setup && (
            <ol
              aria-label={t("team.create")}
              className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted"
            >
              <li>{t("team.step1")}</li>
              <li aria-current="step" className="font-medium text-foreground">
                {t("team.step2")}
              </li>
              <li>{t("team.step3")}</li>
            </ol>
          )}
          {data.canManage && (
            <Dialog
              state={inviteDialog}
              title={lang === "ko" ? "팀원 초대" : "Invite people"}
            >
              {/* Stays open after sending: the form answers per address, and
                  closing would take those answers away with it. */}
              <InviteForm
                key={id}
                workspaceId={id}
                workspace={data.workspace}
                isOwner={data.role === "owner"}
                existingEmails={data.members.map((member) =>
                  member.email.trim().toLowerCase(),
                )}
                pendingEmails={data.invitations
                  .filter(
                    (row) =>
                      !row.acceptedAt &&
                      !row.revokedAt &&
                      new Date(row.expiresAt).getTime() > now,
                  )
                  .map((row) => row.email)}
                availableSeats={seatFigures(data)?.remaining ?? 0}
                ownerEmail={
                  data.members.find((member) => member.role === "owner")?.email
                }
                onChange={load}
              />
            </Dialog>
          )}
          {setup && (
            <button
              className={primaryClass}
              disabled={!!busy}
              onClick={() =>
                action("complete", () => workspaceService.complete(id))
              }
            >
              {t(
                busy === "complete"
                  ? "team.finishing"
                  : data.invitations.length
                    ? "team.finish"
                    : "team.skip",
              )}
            </button>
          )}
          {/*
            One table, not two lists. A pending invitation is a person holding
            a seat; splitting them into "members" and "invitations" is why the
            seat figures needed a paragraph to explain themselves. Notion,
            Linear and Slack all show the invited alongside the joined, with a
            status column doing the separating.
          */}
          <MembersTable
            title={lang === "ko" ? "멤버와 초대" : "Members and invitations"}
            busy={!!busy}
            onInvite={data.canManage ? inviteDialog.open : undefined}
            // Four figures on one line, never a total (D02). The panel form
            // lives on 플랜과 결제, where seats are the subject.
            meta={<SeatBreakdown detail={data} compact />}
            inviteLabel={lang === "ko" ? "초대" : "Invite"}
            // Members only: the table also carries people who have not
            // answered, and counting them here would overstate the team.
            count={visibleMembers.length}
            // The one role table, at the column where the question arises.
            roleGuide={<RoleGuide />}
            roleFilters={[
              { value: "owner", label: t("team.role.owner") },
              { value: "admin", label: t("team.role.admin") },
              { value: "editor", label: t("team.role.editor") },
              { value: "reviewer", label: t("team.role.reviewer") },
            ]}
            rows={[
              ...visibleMembers.map((member) => ({
                id: member.userId,
                name: member.name,
                email: member.email,
                role: member.role,
                roleLabel: t(`team.role.${member.role}`),
                detail: member.suspendedAt
                  ? lang === "ko"
                    ? "참여 정지"
                    : "Suspended"
                  : undefined,
                // The workspace's own role control lives in MemberActions,
                // which also carries the impact preview and the successor
                // question. Re-implementing a bare dropdown here would drop
                // both, so the role stays text and the menu does the work.
                locked: true,
                menu:
                  data.canManage &&
                  data.canManageMembers &&
                  member.userId !== data.currentUserId ? (
                    <MemberActions
                      workspaceId={id}
                      member={member}
                      actorRole={data.role}
                      team={data}
                      onChange={load}
                    />
                  ) : undefined,
              })),
              ...visibleInvites.map((invite) => {
                const status = invitationStatus(invite, now);
                const canManage =
                  invite.role !== "admin" || data.role === "owner";
                const cooling =
                  invite.deliveryStatus !== "failed" &&
                  now - new Date(invite.lastSentAt).getTime() < 60_000;
                return {
                  id: invite.id,
                  name: null,
                  // Says what the row IS. Without it an invitation sits in the
                  // same shape and weight as a member and nothing on the line
                  // says this person has not answered.
                  badge: t(`team.status.${status}`),
                  email: invite.email,
                  role: invite.role,
                  roleLabel: t(`team.role.${invite.role}`),
                  detail: `${t(`team.status.${status}`)}${
                    status === "pending"
                      ? ` · ${t("team.expires", {
                          date: new Date(invite.expiresAt).toLocaleDateString(
                            lang,
                          ),
                        })}`
                      : ""
                  }`,
                  locked: true,
                  menu:
                    canManage && data.canManage ? (
                      <RowMenu>
                        {/*
                          Revoking releases the seat, so resending would
                          silently re-reserve it (F02.4). A revoked invitation
                          is re-sent by inviting again.
                        */}
                        {status !== "revoked" && (
                          <RowMenuItem
                            disabled={!!busy || cooling}
                            onClick={() =>
                              void action(invite.id, async () => {
                                const result = await workspaceService.resend(
                                  id,
                                  invite.id,
                                );
                                setNotice(
                                  `${invite.email} · ${t(
                                    `team.status.${result.status}`,
                                  )}`,
                                );
                              })
                            }
                          >
                            {cooling ? t("team.waitResend") : t("team.resend")}
                          </RowMenuItem>
                        )}
                        {status !== "revoked" && status !== "expired" && (
                          <RowMenuItem
                            tone="danger"
                            disabled={!!busy}
                            onClick={() => setRevokeId(invite.id)}
                          >
                            {t("team.revoke")}
                          </RowMenuItem>
                        )}
                      </RowMenu>
                    ) : undefined,
                };
              }),
            ]}
          />
          {revokeId && (
            <div
              role="alertdialog"
              aria-label={t("team.revoke")}
              className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3"
            >
              <p className="text-sm">{t("team.revokeConfirm")}</p>
              <button
                className={primaryClass}
                disabled={!!busy}
                onClick={() =>
                  void action(revokeId, async () => {
                    await workspaceService.revoke(id, revokeId);
                    setRevokeId("");
                  })
                }
              >
                {t("team.revoke")}
              </button>
              <button
                className={secondaryClass}
                onClick={() => setRevokeId("")}
              >
                {t("team.cancel")}
              </button>
            </div>
          )}
          {notice && (
            <p role="status" className="text-sm">
              {notice}
            </p>
          )}
        </>
      )}
      {/* An escape hatch for the first run, when this screen is a step in
          creating a team. Afterwards the switcher is how you leave. */}
      {setup && (
        <Link href="/dashboard" className={secondaryClass}>
          {t("team.personal")}
        </Link>
      )}
    </TeamShell>
  );
}
