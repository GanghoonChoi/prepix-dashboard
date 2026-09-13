"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Users, Cloud } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { invitationStatus, workspaceError } from "@/lib/workspaces/onboarding";
import { InviteForm } from "@/components/workspaces/invite-form";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <WorkspaceContent key={id} id={id} />;
}

function WorkspaceContent({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [revokeId, setRevokeId] = useState("");
  const [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    try {
      const next = await workspaceService.detail(id);
      setData(next);
      setError("");
    } catch (e) {
      const code = workspaceError(e);
      setError(code);
      if (code === "WORKSPACE_NOT_FOUND" || code === "WORKSPACES_DISABLED")
        setData(null);
    }
  }, [id]);
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
  const rows = data?.invitations.filter((invite) => !invite.acceptedAt) ?? [];
  return (
    <TeamShell
      title={data?.workspace.name ?? t("team.title")}
      description={setup ? t("team.inviteDesc") : t("team.readyDesc")}
    >
      {error && <TeamError code={error} retry={load} />}
      {!data && !error && <TeamLoading />}
      {data && (
        <>
          {setup ? (
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
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
              <Check size={20} strokeWidth={1.5} aria-hidden="true" />
              {t("team.readyTitle")}
            </div>
          )}
          <section className="space-y-3 rounded-xl border border-border p-5">
            <h2 className="text-sm font-medium">{t("team.seats")}</h2>
            <p className="text-xl font-medium tabular-nums">
              {t("team.seatCount", {
                used: data.seats.used,
                reserved: data.seats.reserved,
                limit: data.workspace.seatLimit,
              })}
            </p>
            <p className="text-xs leading-5 text-muted">{t("team.seatHint")}</p>
          </section>
          {data.canManage && (
            <section className="space-y-5 rounded-xl border border-border p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-medium">
                <Users size={20} strokeWidth={1.5} aria-hidden="true" />
                {t("team.inviteTitle")}
              </h2>
              <InviteForm
                key={id}
                workspaceId={id}
                isOwner={data.role === "owner"}
                existingEmails={data.members.map((member) =>
                  member.email.trim().toLowerCase()
                )}
                pendingEmails={data.invitations
                  .filter(
                    (invite) =>
                      !invite.acceptedAt &&
                      !invite.revokedAt &&
                      new Date(invite.expiresAt).getTime() > now
                  )
                  .map((invite) => invite.email)}
                availableSeats={Math.max(
                  0,
                  data.workspace.seatLimit -
                    data.seats.used -
                    data.seats.reserved
                )}
                onChange={load}
              />
            </section>
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
                  : "team.skip"
              )}
            </button>
          )}
          <section className="space-y-3">
            <h2 className="font-medium">
              {t("team.members")}{" "}
              <span className="ml-2 text-sm font-normal tabular-nums text-muted">
                {data.members.length}
              </span>
            </h2>
            <ul className="divide-y divide-border rounded-xl border border-border px-5">
              {data.members.map((member) => (
                <li
                  key={member.userId}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">
                      {member.name || member.email}
                    </p>
                    {member.name && (
                      <p className="mt-1 break-all text-xs text-muted">
                        {member.email}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {t(`team.role.${member.role}`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {data.canManage && (
            <section className="space-y-3">
              <h2 className="font-medium">{t("team.invitations")}</h2>
              {notice && (
                <p role="status" className="text-sm">
                  {notice}
                </p>
              )}
              {!rows.length ? (
                <p className="text-sm text-muted">{t("team.noInvitations")}</p>
              ) : (
                <ul className="divide-y divide-border rounded-xl border border-border px-5">
                  {rows.map((invite) => {
                    const status = invitationStatus(invite, now);
                    const canManage =
                      invite.role !== "admin" || data.role === "owner";
                    const cooling =
                      invite.deliveryStatus !== "failed" &&
                      now - new Date(invite.lastSentAt).getTime() < 60_000;
                    return (
                      <li key={invite.id} className="space-y-3 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="break-all text-sm font-medium">
                              {invite.email}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-muted">
                              {t(`team.role.${invite.role}`)} ·{" "}
                              {t(`team.status.${status}`)}
                            </p>
                            <p className="text-xs leading-5 text-muted">
                              {t("team.expires", {
                                date: new Date(
                                  invite.expiresAt
                                ).toLocaleDateString(lang),
                              })}
                            </p>
                          </div>
                          {canManage && (
                            <div className="flex flex-wrap gap-2">
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
                                        invite.id
                                      );
                                    setNotice(
                                      `${invite.email} · ${t(
                                        `team.status.${result.status}`
                                      )}`
                                    );
                                  })
                                }
                              >
                                {t("team.resend")}
                              </button>
                              {status !== "revoked" && status !== "expired" && (
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
                        </div>
                        {revokeId === invite.id && (
                          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3">
                            <p className="text-sm">{t("team.revokeConfirm")}</p>
                            <button
                              className={primaryClass}
                              disabled={!!busy}
                              onClick={() =>
                                action(invite.id, async () => {
                                  await workspaceService.revoke(id, invite.id);
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
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
          <section className="flex gap-4 rounded-xl border border-border bg-surface p-5">
            <Cloud
              className="mt-0.5 shrink-0"
              size={22}
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <h2 className="text-sm font-medium">{t("team.cloudTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {t("team.cloudDesc")}
              </p>
            </div>
          </section>
        </>
      )}
      <Link href="/dashboard" className={secondaryClass}>
        {t("team.personal")}
      </Link>
    </TeamShell>
  );
}
