"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, CreditCard, Plus, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  organizationService,
  type OrganizationDetail,
  type OrganizationRole,
} from "@/lib/api/services/organization.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
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
  const [name, setName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | OrganizationRole>("all");
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
    void load();
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.members ?? []).filter(
      (m) =>
        (!needle ||
          `${m.name ?? ""} ${m.email}`.toLowerCase().includes(needle)) &&
        (filter === "all" || m.role === filter),
    );
  }, [data, query, filter]);

  if (error && !data) return <TeamError code={error} retry={load} />;
  if (!data) return <TeamLoading />;

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
      <section className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
              {c("멤버", "Members")}
              <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium tabular-nums text-muted">
                {data.members.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted">
              {c(
                "조직에 사람들을 초대하고 역할을 관리하세요.",
                "Invite people to the organisation and manage their roles.",
              )}
            </p>
          </div>
          {data.canManage && (
            <button
              className={primaryClass}
              onClick={() => setInviting((was) => !was)}
              aria-expanded={inviting}
            >
              <Plus size={16} strokeWidth={2} aria-hidden="true" />
              {c("초대", "Invite")}
            </button>
          )}
        </div>

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
                    ? c(`${email} 추가됨`, `${email} added`)
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
                {ASSIGNABLE.filter(
                  (role) => role !== "billing" || data.role === "owner",
                ).map((role) => (
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

        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search
              size={15}
              strokeWidth={1.5}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              className={`${inputClass.replace("w-full", "w-full sm:w-72")} pl-9`}
              aria-label={c("멤버 검색", "Search members")}
              placeholder={c(
                "이름 또는 이메일로 검색",
                "Search by name or email",
              )}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className={inputClass.replace("w-full", "w-full sm:w-40")}
            aria-label={c("역할", "Role")}
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as "all" | OrganizationRole)
            }
          >
            <option value="all">{c("역할 전체", "All roles")}</option>
            {(["owner", ...ASSIGNABLE] as OrganizationRole[]).map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th scope="col" className="py-3 pr-4 font-normal">
                {c("이름", "Name")}
              </th>
              <th scope="col" className="py-3 pr-4 font-normal">
                {c("이메일", "Email")}
              </th>
              <th scope="col" className="py-3 pr-4 font-normal">
                {c("역할", "Role")}
              </th>
              <th scope="col" className="w-12 py-3">
                <span className="sr-only">{c("작업", "Actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((member) => {
              const isOwner = member.role === "owner";
              const isMe = member.userId === data.currentUserId;
              // Only the owner moves anybody in or out of billing, so an admin
              // sees those rows as text rather than a control the server would
              // refuse. Your own row is text too: you do not demote yourself
              // by misclicking a dropdown.
              const locked =
                isOwner ||
                isMe ||
                !data.canManage ||
                (data.role !== "owner" && member.role === "billing");
              return (
                <tr key={member.userId} className="border-b border-border">
                  <td className="py-3 pr-4">
                    <span className="font-medium">
                      {member.name || member.email.split("@")[0]}
                    </span>
                  </td>
                  <td className="break-all py-3 pr-4 text-muted">
                    {member.email}
                  </td>
                  <td className="py-3 pr-4">
                    {locked ? (
                      <span className="text-muted">
                        {roleLabel(member.role)}
                      </span>
                    ) : (
                      <select
                        className="min-h-9 rounded-lg border border-border bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/40"
                        aria-label={c("역할", "Role")}
                        value={member.role}
                        disabled={!!busy}
                        onChange={(event) =>
                          void act(member.userId, () =>
                            organizationService.changeMember(
                              id,
                              member.userId,
                              event.target.value as Exclude<
                                OrganizationRole,
                                "owner"
                              >,
                            ),
                          )
                        }
                      >
                        {ASSIGNABLE.filter(
                          (role) => role !== "billing" || data.role === "owner",
                        ).map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {/* Nothing to offer, no kebab — see RowMenu. */}
                    {!locked && (
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
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p role="status" className="py-4 text-sm text-muted">
            {c("해당하는 사람이 없습니다.", "Nobody matches.")}
          </p>
        )}
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
          <Link
            href={`/dashboard/organizations/${id}/billing`}
            className={secondaryClass}
          >
            {c("결제 열기", "Open billing")}
          </Link>
        </section>
      )}
    </TeamShell>
  );
}
