"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Check, ChevronsUpDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";
import { workspaceLinks, navActive } from "@/lib/workspaces/nav";
import { cloudService } from "@/lib/api/services/cloud.service";
import { SpaceIcon, useSpaceName } from "./shared";

/**
 * One row for the space you are in, and a menu for the rest — where Notion,
 * Linear and ElevenLabs all land. The previous version printed every workspace
 * in the sidebar under two headings; that reads well at two and grows without
 * bound at ten, and the sidebar is the one surface that cannot afford to.
 *
 * Two kinds of thing, so the menu still groups them (spec D13) and still titles
 * a personal space for what it is rather than by its server name.
 *
 * This does NOT become the only place the current space is named. A Figma user
 * added an editor to a draft without realising it sat in a client's team space
 * and ended up on that client's payroll, because the space was only ever shown
 * in a switcher at the top of the page. The inline markers on the upload,
 * publish, share and create surfaces are what prevent that, and they stay
 * exactly where they are — see `shared.tsx`.
 */
export function WorkspaceSwitcher({ onClose }: { onClose?: () => void }) {
  const { t, lang } = useI18n();
  const ko = lang === "ko";
  const path = usePathname();
  const spaceName = useSpaceName();
  const [rows, setRows] = useState<WorkspaceList["workspaces"] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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

  // A menu that stays open after you click away is a menu you have to fight.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Every team page lives under /dashboard/workspaces/<id>, so the id in the
  // URL is the whole answer. This used to also translate an organisation route
  // back into the workspace beneath it, by way of a list fetched after mount —
  // which is why the nav below changed shape a moment after the page painted.
  const currentId = path.match(
    /^\/dashboard\/workspaces\/([a-f0-9-]{36})(?:\/|$)/,
  )?.[1];
  // Off a workspace page (usage, plan, settings) there is no id in the URL.
  // Those pages belong to the personal space, so that is what the button names
  // — never a blank chooser.
  const current =
    rows?.find((row) => row.id === currentId) ??
    rows?.find(isPersonal) ??
    rows?.[0] ??
    null;

  // Keyed by workspace so a stale answer can never light the wrong nav, which
  // is also why this needs no reset-on-change inside the effect.
  const spaceId = current?.id;
  const [cloud, setCloud] = useState<{ id: string; enabled: boolean } | null>(
    null,
  );
  useEffect(() => {
    if (!spaceId) return;
    let alive = true;
    void cloudService
      .capabilities(spaceId)
      .then((caps) => {
        if (alive) setCloud({ id: spaceId, enabled: caps.enabled });
      })
      .catch(() => {
        // An unreachable probe is not proof the archive is gone, but a link
        // that 404s is worse than none — the overview carries a card to it.
      });
    return () => {
      alive = false;
    };
  }, [spaceId]);
  const cloudEnabled = !!cloud && cloud.id === spaceId && cloud.enabled;

  const pick = () => {
    setOpen(false);
    onClose?.();
  };

  return (
    <div ref={root} className="border-b border-border px-3 py-3">
      {rows === null ? (
        <p className="px-2 py-2 text-sm text-muted">
          {ko ? "불러오는 중…" : "Loading…"}
        </p>
      ) : !current ? (
        // Provisioned for every account, so an empty list is the server still
        // catching up. A waiting line, never a "create one" dead end.
        <p className="px-2 py-2 text-sm text-muted">
          {ko ? "준비하는 중…" : "Getting ready…"}
        </p>
      ) : (
        <>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((was) => !was)}
              aria-haspopup="menu"
              aria-expanded={open}
              data-space={isPersonal(current) ? "personal" : "team"}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-sm text-foreground transition-colors hover:bg-foreground/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground aria-expanded:bg-foreground/[0.06]"
            >
              {/* A tile, not a bullet: at this size a bare outline icon reads
                  as decoration next to the name, and this row is the identity
                  of everything below it. */}
              <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface">
                <SpaceIcon
                  kind={isPersonal(current) ? "personal" : "team"}
                  size={15}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {spaceName(current)}
              </span>
              <ChevronsUpDown
                size={14}
                strokeWidth={1.5}
                aria-hidden="true"
                className="shrink-0 text-muted"
              />
            </button>

            {open && (
              <div
                role="menu"
                className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-lg border border-border bg-background shadow-lg"
              >
                <ul className="max-h-[50vh] overflow-y-auto p-1">
                {rows.map((row, index) => {
                  const personal = isPersonal(row);
                  // One heading per kind, above the first row of that kind, so
                  // the two groups never read as one list of similar objects.
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
                        <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted first:pt-1">
                          {t(heading)}
                        </p>
                      )}
                      <Link
                        href={`/dashboard/workspaces/${row.id}`}
                        onClick={pick}
                        role="menuitem"
                        data-space={personal ? "personal" : "team"}
                        aria-current={row.id === current.id ? "page" : undefined}
                        className={`flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${
                          row.id === current.id
                            ? "bg-foreground/[0.06] font-medium text-foreground"
                            : "text-foreground/80 hover:bg-foreground/[0.04] hover:text-foreground"
                        }`}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-surface">
                          <SpaceIcon
                            kind={personal ? "personal" : "team"}
                            size={15}
                          />
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {spaceName(row)}
                        </span>
                        {row.id === current.id && (
                          <Check
                            size={15}
                            strokeWidth={2.25}
                            aria-hidden="true"
                            className="shrink-0"
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
                <div className="border-t border-border p-1">
                  <Link
                    href="/dashboard/workspaces"
                    onClick={pick}
                    role="menuitem"
                    className="flex min-h-11 items-center rounded-md px-2 text-[13px] text-muted transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
                  >
                    {ko ? "워크스페이스 관리" : "Manage workspaces"}
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* The nav for the space the button names. It used to be a row of
              tabs inside the page while this sidebar listed the ACCOUNT's
              pages, so choosing a team here left the nav beside it pointing
              somewhere else. */}
          <nav
            aria-label={ko ? "워크스페이스 메뉴" : "Workspace navigation"}
            className="mt-2 space-y-0.5"
          >
            {workspaceLinks(current, {
              cloudEnabled,
              managementEnabled: current.managementEnabled !== false,
              role: current.role,
            }).map((link) => {
              const active = navActive(
                path,
                link.href,
                `/dashboard/workspaces/${current.id}`,
              );
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`block min-h-11 rounded-md px-2 py-3 text-[13px] transition-colors ${
                    active
                      ? "bg-foreground/[0.06] font-medium text-foreground"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {ko ? link.ko : link.en}
                </Link>
              );
            })}
          </nav>
        </>
      )}
      {failed && (
        <button
          className="min-h-11 px-2 text-left text-xs underline"
          onClick={load}
        >
          {ko ? "워크스페이스 다시 불러오기" : "Retry workspace list"}
        </button>
      )}
    </div>
  );
}
