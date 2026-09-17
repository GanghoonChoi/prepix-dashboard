"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CreditCard, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  organizationService,
  type OrganizationDetail,
  type OrganizationRole,
} from "@/lib/api/services/organization.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

/**
 * Organisation settings: who is in the company, what workspaces it owns, and
 * who pays. The Console splits exactly this way (Settings > Organization →
 * Members · Workspaces · Billing) and Frame.io's Account Settings does too.
 *
 * Billing is behind `canManageBilling`, which the server sends. An admin runs
 * the team and does not see the card.
 */
export default function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}

const ROLES: Exclude<OrganizationRole, "owner">[] = ["admin", "billing", "member"];

function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await organizationService.detail(id));
      setError("");
    } catch (e) {
      setError(workspaceError(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
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

  if (error && !data) return <TeamError code={error} retry={load} />;
  if (!data) return <TeamLoading />;

  const roleLabel = (role: OrganizationRole) =>
    ({
      owner: c("소유자", "Owner"),
      admin: c("관리자", "Admin"),
      billing: c("결제", "Billing"),
      member: c("멤버", "Member"),
    })[role];

  return (
    <TeamShell title={c("조직 설정", "Organization settings")}>
      {error && <TeamError code={error} retry={load} />}

      {/* ── 조직 ─────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-xl border border-border p-5">
        <h2 className="text-sm font-medium">{c("조직", "Organization")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name?.trim();
            if (!next) return;
            void act("rename", async () => {
              await organizationService.rename(id, next);
              setName(null);
            });
          }}
        >
          <label className="block flex-1 space-y-2 text-sm">
            <span>{c("이름", "Name")}</span>
            <input
              className={inputClass}
              maxLength={80}
              disabled={!data.canManage || !!busy}
              value={name ?? data.organization.name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {data.canManage && name !== null && (
            <button className={primaryClass} disabled={!!busy}>
              {c("변경 저장", "Save changes")}
            </button>
          )}
        </form>
      </section>

      {/* ── 멤버 ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Users size={18} strokeWidth={1.5} aria-hidden="true" />
          {c("멤버", "Members")}
          <span className="text-sm font-normal tabular-nums text-muted">
            {data.members.length}
          </span>
        </h2>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-5 py-3 font-normal">
                  {c("사용자", "User")}
                </th>
                <th scope="col" className="px-5 py-3 font-normal">
                  {c("역할", "Role")}
                </th>
                <th scope="col" className="px-5 py-3">
                  <span className="sr-only">{c("작업", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.members.map((member) => {
                const isOwner = member.role === "owner";
                const isMe = member.userId === data.currentUserId;
                // Only the owner moves anybody in or out of billing, so an
                // admin sees those rows read-only rather than a control that
                // the server would refuse.
                const locked =
                  isOwner ||
                  isMe ||
                  !data.canManage ||
                  (data.role !== "owner" && member.role === "billing");
                return (
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
                    <td className="whitespace-nowrap px-5 py-3">
                      {locked ? (
                        <span className="text-muted">
                          {roleLabel(member.role)}
                        </span>
                      ) : (
                        <select
                          className={inputClass.replace("w-full", "w-36")}
                          aria-label={c("역할", "Role")}
                          value={member.role}
                          disabled={!!busy}
                          onChange={(event) =>
                            void act(member.userId, () =>
                              organizationService.changeMember(
                                id,
                                member.userId,
                                event.target
                                  .value as Exclude<OrganizationRole, "owner">,
                              ),
                            )
                          }
                        >
                          {ROLES.filter(
                            (role) =>
                              role !== "billing" || data.role === "owner",
                          ).map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!locked && (
                        <button
                          className={secondaryClass}
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
                          {c("내보내기", "Remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {data.canManage && (
          <p className="text-xs leading-5 text-muted">
            {c(
              "내보내면 이 조직의 모든 워크스페이스에서도 함께 빠집니다.",
              "Removing someone also takes them out of every workspace here.",
            )}
          </p>
        )}
      </section>

      {/* ── 워크스페이스 ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-medium">
          <Building2 size={18} strokeWidth={1.5} aria-hidden="true" />
          {c("워크스페이스", "Workspaces")}
          <span className="text-sm font-normal tabular-nums text-muted">
            {data.workspaces.length}
          </span>
        </h2>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {data.workspaces.map((space) => (
            <li
              key={space.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
            >
              <Link
                href={`/dashboard/workspaces/${space.id}`}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {space.name}
              </Link>
              <span className="text-xs tabular-nums text-muted">
                {c(`멤버 ${space.members}`, `${space.members} members`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 결제 ─────────────────────────────────────────────────── */}
      {data.canManageBilling && (
        <section className="space-y-3 rounded-xl border border-border p-5">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <CreditCard size={18} strokeWidth={1.5} aria-hidden="true" />
            {c("결제", "Billing")}
          </h2>
          {/*
            Honest placeholder. Team billing does not exist yet — subscriptions
            are still attached to a person, not to this organisation — and a
            screen that implies otherwise is worse than one that says so.
          */}
          <p className="text-sm leading-6 text-muted">
            {c(
              "팀 결제는 아직 연결되지 않았습니다. 지금은 각자의 개인 플랜이 그대로 적용됩니다.",
              "Team billing is not connected yet. Everyone's personal plan still applies.",
            )}
          </p>
          <Link href="/dashboard/plan" className={secondaryClass}>
            {c("내 플랜 보기", "View my plan")}
          </Link>
        </section>
      )}
    </TeamShell>
  );
}
