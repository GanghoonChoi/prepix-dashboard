"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "./workspace-context";
import { MemberActions } from "@/components/workspaces/member-actions";
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
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

export function MembersContent({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const context = useWorkspace()!;
  const data = context.data;
  const load = context.reload;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeId, setRevokeId] = useState("");
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
  const setup = data?.canManage && !data.workspace.onboardingCompletedAt;
  const hit = (text: string) =>
    !query || text.toLowerCase().includes(query.trim().toLowerCase());
  // Pending invitations sit in the same table as members, so they answer to
  // the same search box — and to a status filter that can single them out.
  const visibleInvites = (data?.invitations ?? []).filter(
    (invite) =>
      !invite.acceptedAt &&
      hit(invite.email) &&
      (filter === "all" || filter === "invited"),
  );
  const visibleMembers = (data?.members ?? [])
    .filter(
      (member) =>
        hit(`${member.name ?? ""} ${member.email}`) &&
        (filter === "all" ||
          (filter === "suspended"
            ? !!member.suspendedAt
            : filter === "active"
              ? !member.suspendedAt
              : false)),
    )
    .sort(
      (a, b) =>
        Number(!!a.suspendedAt) * 10 +
        { owner: 0, admin: 1, editor: 2, reviewer: 3 }[a.role] -
        (Number(!!b.suspendedAt) * 10 +
          { owner: 0, admin: 1, editor: 2, reviewer: 3 }[b.role]),
    );
  return (
    <TeamShell
      title={
        setup ? (data?.workspace.name ?? t("team.title")) : t("team.members")
      }
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
          {/*
            Four figures, never one total. `team.seatCount` used to print
            "3 joined + 2 invited / 10", which still reads as one sum and hid
            suspended members entirely.
          */}
          <SeatBreakdown detail={data} />
          {data.canManage && (
            <details
              open={setup}
              className="space-y-4 rounded-xl border border-border p-5"
            >
              <summary className="cursor-pointer text-sm font-medium">
                {lang === "ko" ? "팀원 초대" : "Invite people"}
              </summary>
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
                    (invite) =>
                      !invite.acceptedAt &&
                      !invite.revokedAt &&
                      new Date(invite.expiresAt).getTime() > now,
                  )
                  .map((invite) => invite.email)}
                availableSeats={seatFigures(data)?.remaining ?? 0}
                ownerEmail={
                  data.members.find((member) => member.role === "owner")?.email
                }
                onChange={load}
              />
            </details>
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
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-medium">
                {lang === "ko" ? "멤버와 초대" : "Members and invitations"}{" "}
                <span className="ml-1 text-sm font-normal tabular-nums text-muted">
                  {visibleMembers.length + visibleInvites.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <input
                  className={`${inputClass.replace("w-full", "w-full sm:w-56")}`}
                  aria-label={lang === "ko" ? "멤버 검색" : "Search members"}
                  placeholder={
                    lang === "ko" ? "이름 또는 이메일" : "Name or email"
                  }
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  className={`${inputClass.replace("w-full", "w-full sm:w-36")}`}
                  aria-label={lang === "ko" ? "상태" : "Status"}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">{lang === "ko" ? "전체" : "All"}</option>
                  <option value="active">
                    {lang === "ko" ? "참여 중" : "Active"}
                  </option>
                  <option value="invited">
                    {lang === "ko" ? "초대함" : "Invited"}
                  </option>
                  <option value="suspended">
                    {lang === "ko" ? "참여 정지" : "Suspended"}
                  </option>
                </select>
              </div>
            </div>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            {visibleMembers.length + visibleInvites.length === 0 ? (
              <p role="status" className="py-4 text-sm text-muted">
                {lang === "ko" ? "해당하는 사람이 없습니다." : "Nobody matches."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th scope="col" className="px-5 py-3 font-normal">
                        {lang === "ko" ? "사용자" : "User"}
                      </th>
                      <th scope="col" className="px-5 py-3 font-normal">
                        {t("team.role")}
                      </th>
                      <th scope="col" className="px-5 py-3 font-normal">
                        {lang === "ko" ? "상태" : "Status"}
                      </th>
                      <th scope="col" className="px-5 py-3">
                        <span className="sr-only">
                          {lang === "ko" ? "작업" : "Actions"}
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {visibleMembers.map((member) => (
                      <tr key={member.userId}>
                        <td className="px-5 py-3">
                          <p className="break-all font-medium">
                            {member.name || member.email}
                          </p>
                          {member.name && (
                            <p className="break-all text-xs text-muted">
                              {member.email}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted">
                          {t(`team.role.${member.role}`)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-muted">
                          {member.suspendedAt
                            ? lang === "ko"
                              ? "참여 정지"
                              : "Suspended"
                            : lang === "ko"
                              ? "참여 중"
                              : "Active"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {data.canManage &&
                            data.canManageMembers &&
                            member.userId !== data.currentUserId && (
                              <MemberActions
                                workspaceId={id}
                                member={member}
                                actorRole={data.role}
                                team={data}
                                onChange={load}
                              />
                            )}
                        </td>
                      </tr>
                    ))}
                    {visibleInvites.map((invite) => {
                      const status = invitationStatus(invite, now);
                      const canManage =
                        invite.role !== "admin" || data.role === "owner";
                      const cooling =
                        invite.deliveryStatus !== "failed" &&
                        now - new Date(invite.lastSentAt).getTime() < 60_000;
                      return (
                        <tr key={invite.id}>
                          <td className="px-5 py-3">
                            <p className="break-all font-medium">
                              {invite.email}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted">
                            {t(`team.role.${invite.role}`)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-3 text-muted">
                            {t(`team.status.${status}`)}
                            {status === "pending" && (
                              <span className="block text-xs tabular-nums">
                                {t("team.expires", {
                                  date: new Date(
                                    invite.expiresAt,
                                  ).toLocaleDateString(lang),
                                })}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {canManage && data.canManage && (
                              <div className="flex justify-end gap-2">
                                {/*
                                  Revoking releases the seat, so resending would
                                  silently re-reserve it (F02.4). A revoked
                                  invitation is re-sent by inviting again.
                                */}
                                {status !== "revoked" && (
                                  <button
                                    className={secondaryClass}
                                    disabled={!!busy || cooling}
                                    title={
                                      cooling ? t("team.waitResend") : undefined
                                    }
                                    onClick={() =>
                                      action(invite.id, async () => {
                                        const result =
                                          await workspaceService.resend(
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
                                    {t("team.resend")}
                                  </button>
                                )}
                                {status !== "revoked" &&
                                  status !== "expired" && (
                                    <button
                                      className={secondaryClass}
                                      disabled={!!busy}
                                      onClick={() => setRevokeId(invite.id)}
                                    >
                                      {t("team.revoke")}
                                    </button>
                                  )}
                              </div>
                            )}
                            {revokeId === invite.id && (
                              <div
                                role="alertdialog"
                                aria-label={t("team.revoke")}
                                className="mt-2 flex flex-wrap items-center justify-end gap-2 rounded-lg bg-surface p-3 text-left"
                              >
                                <p className="text-sm">
                                  {t("team.revokeConfirm")}
                                </p>
                                <button
                                  className={primaryClass}
                                  disabled={!!busy}
                                  onClick={() =>
                                    action(invite.id, async () => {
                                      await workspaceService.revoke(
                                        id,
                                        invite.id,
                                      );
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
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
