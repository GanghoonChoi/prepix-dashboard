"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, CreditCard, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  organizationService,
  type OrganizationDetail,
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
 * The organisation itself: its name and the workspaces it holds.
 *
 * Members and billing have their own routes, because the sidebar entries are
 * called 멤버 and 결제 and a label that lands somewhere broader than it
 * promises is a small lie the reader has to correct every time.
 *
 * While an organisation holds one workspace the sidebar does not link here at
 * all — that team edits its name in workspace settings and there is nothing
 * else here for it. It appears when a second workspace does.
 */
export default function OrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}

function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  if (error && !data) return <TeamError code={error} retry={load} />;
  if (!data) return <TeamLoading />;

  return (
    <TeamShell title={c("조직 설정", "Organization settings")}>
      {error && <TeamError code={error} retry={load} />}

      <section className="space-y-4 rounded-xl border border-border p-5">
        <h2 className="text-sm font-medium">{c("이름", "Name")}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name?.trim();
            if (!next || busy) return;
            setBusy(true);
            void organizationService
              .rename(id, next)
              .then(() => {
                setName(null);
                return load();
              })
              .catch((e) => setError(workspaceError(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block flex-1 space-y-2 text-sm">
            <span className="sr-only">
              {c("조직 이름", "Organisation name")}
            </span>
            <input
              className={inputClass}
              maxLength={80}
              disabled={!data.canManage || busy}
              value={name ?? data.organization.name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {data.canManage && name !== null && (
            <button className={primaryClass} disabled={busy}>
              {c("변경 저장", "Save changes")}
            </button>
          )}
        </form>
      </section>

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

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/dashboard/organizations/${id}/members`}
          className={secondaryClass}
        >
          <Users size={16} strokeWidth={1.5} aria-hidden="true" />
          {c("멤버", "Members")}
        </Link>
        {data.canManageBilling && (
          <Link
            href={`/dashboard/organizations/${id}/billing`}
            className={secondaryClass}
          >
            <CreditCard size={16} strokeWidth={1.5} aria-hidden="true" />
            {c("결제", "Billing")}
          </Link>
        )}
      </div>
    </TeamShell>
  );
}
