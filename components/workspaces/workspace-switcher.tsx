"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";
import { SpaceIcon, useSpaceName } from "./shared";

/**
 * Two kinds of thing, so two kinds of row (spec D13).
 *
 * The previous version of this file removed the personal entry entirely and
 * said personal-vs-team was the wrong model. The product decided the opposite:
 * the personal space exists, on the server, in the app and here. What was right
 * about that note is that the old "개인 공간" link was a link to the account
 * pages wearing a workspace costume — this is the actual workspace, named for
 * what it is and shaped like a person rather than a building.
 *
 * A list of links, not a <select>: a select cannot carry the shape, and the
 * shape is the whole point. It also means a one-workspace account reads as
 * "your space" rather than a chooser with one option in it.
 */
export function WorkspaceSwitcher({ onClose }: { onClose?: () => void }) {
  const { t, lang } = useI18n();
  const path = usePathname();
  const spaceName = useSpaceName();
  const [rows, setRows] = useState<WorkspaceList["workspaces"] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      setRows(
        personalFirst(
          (await workspaceService.list()).workspaces.filter(
            (w) => !w.suspendedAt,
          ),
        ),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    window.addEventListener("focus", load);
    window.addEventListener("workspaces:changed", load);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", load);
      window.removeEventListener("workspaces:changed", load);
    };
    // `path` is deliberately not a dependency: the list does not change
    // because the user navigated within the dashboard.
  }, [load]);
  const current = path.match(
    /^\/dashboard\/workspaces\/([a-f0-9-]{36})(?:\/|$)/,
  )?.[1];
  const teams = rows?.filter((row) => !isPersonal(row)) ?? [];
  return (
    <div className="space-y-2 border-b border-border px-4 py-4">
      {rows === null ? (
        <p className="text-sm text-muted">
          {lang === "ko" ? "불러오는 중…" : "Loading…"}
        </p>
      ) : rows.length === 0 ? (
        // Provisioned for every account, so an empty list is the server still
        // catching up. A waiting line, never a "create one" dead end.
        <p className="text-sm text-muted">
          {lang === "ko" ? "준비하는 중…" : "Getting ready…"}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((row, index) => {
            const personal = isPersonal(row);
            // One heading per kind, printed above the first row of that kind,
            // so the two groups never read as one list of similar objects.
            const heading =
              index === 0
                ? personal
                  ? "team.spaceHeading"
                  : "team.teamsHeading"
                : personal === isPersonal(rows[index - 1])
                  ? null
                  : "team.teamsHeading";
            return (
              <li key={row.id}>
                {heading && (
                  <p className="px-1 pb-1 pt-3 text-[11px] text-muted first:pt-0">
                    {t(heading)}
                  </p>
                )}
                <Link
                  href={`/dashboard/workspaces/${row.id}`}
                  onClick={onClose}
                  data-space={personal ? "personal" : "team"}
                  aria-current={row.id === current ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${
                    row.id === current
                      ? "bg-foreground/[0.06] font-medium text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <SpaceIcon kind={personal ? "personal" : "team"} size={16} />
                  <span className="min-w-0 truncate">{spaceName(row)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {rows !== null && rows.length > 0 && teams.length === 0 && (
        // A single-workspace account is not an empty team list — it is a person
        // who has not needed a team yet, and the copy has to say so.
        <p className="px-1 pt-2 text-[11px] leading-5 text-muted">
          {t("team.personalNoTeams")}
        </p>
      )}
      {failed && (
        <button className="min-h-11 text-left text-xs underline" onClick={load}>
          {lang === "ko" ? "워크스페이스 다시 불러오기" : "Retry workspace list"}
        </button>
      )}
      <Link
        className="inline-flex min-h-11 items-center text-xs text-muted hover:text-foreground"
        href="/dashboard/workspaces"
        onClick={onClose}
      >
        {lang === "ko" ? "워크스페이스 관리" : "Manage workspaces"}
      </Link>
    </div>
  );
}
