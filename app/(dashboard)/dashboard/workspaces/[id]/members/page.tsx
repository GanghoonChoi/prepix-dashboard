"use client";
import { use } from "react";
import { MembersContent } from "@/components/workspaces/members-content";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { TeamShell } from "@/components/workspaces/shared";
import { useI18n } from "@/lib/i18n/context";
import { isPersonal } from "@/lib/workspaces/kind";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const context = useWorkspace();
  /**
   * The tab is gone for a personal space; this is the address bar. It says the
   * concept does not exist here rather than rendering an empty member list with
   * an invite form on it — there must be no invite affordance anywhere in a
   * personal space, including on a URL somebody kept in a bookmark.
   */
  if (context && isPersonal(context.data.workspace))
    return (
      <TeamShell title={t("team.personalTitle")}>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {t("team.personalNoMembers")}
        </p>
      </TeamShell>
    );
  return <MembersContent key={id} id={id} />;
}
