"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import {
  workspaceService,
  type WorkspaceList,
} from "@/lib/api/services/workspace.service";
import { isPersonal, personalFirst } from "@/lib/workspaces/kind";
import { workspaceLinks, type NavLink } from "@/lib/workspaces/nav";
import { b2bService, type B2bStatus } from "@/lib/api/services/b2b.service";
import { cloudService } from "@/lib/api/services/cloud.service";
import { useWorkspaceCapabilities } from "@/components/workspaces/capabilities";

export type SpaceRow = WorkspaceList["workspaces"][number];

/**
 * The space the shell is showing, computed once for the sidebar, the top bar's
 * location and the command palette. Each used to fetch on its own — the
 * desktop and mobile sidebars were two switchers polling the same endpoints.
 *
 * `links` is never empty. Without the team capability, or before the list
 * lands, the personal pages render from their static routes: the old sidebar
 * drew nothing at all in that state, which left no way to reach plan or
 * settings.
 */
type Space = {
  rows: SpaceRow[] | null;
  failed: boolean;
  reload: () => void;
  /** The workspace menu is offered at all. */
  teams: boolean;
  current: SpaceRow | null;
  /** Where "home" is for the current space. */
  base: string;
  links: NavLink[];
};

const PERSONAL_FALLBACK = workspaceLinks(
  { id: "", type: "personal" },
  { cloudEnabled: false, managementEnabled: true },
);

const Context = createContext<Space>({
  rows: null,
  failed: false,
  reload: () => {},
  teams: false,
  current: null,
  base: "/dashboard",
  links: PERSONAL_FALLBACK,
});

export const useCurrentSpace = () => useContext(Context);

export function CurrentSpace({ children }: { children: React.ReactNode }) {
  const { capabilities, status } = useWorkspaceCapabilities();
  // A probe we could not reach is not proof the feature is gone. Keep the
  // menu where it was so a blip does not remove the way back to a team.
  const teams = !!capabilities?.enabled || status === "unreachable";
  const path = usePathname();
  const [rows, setRows] = useState<SpaceRow[] | null>(null);
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
    if (!teams) return;
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
  }, [load, teams]);

  // Every team page lives under /dashboard/workspaces/<id>, so the id in the
  // URL is the whole answer. Off a workspace page (home, plan, settings) the
  // page belongs to the personal space — never a blank chooser.
  const currentId = path.match(
    /^\/dashboard\/workspaces\/([a-f0-9-]{36})(?:\/|$)/,
  )?.[1];
  const current = teams
    ? (rows?.find((row) => row.id === currentId) ??
      rows?.find(isPersonal) ??
      rows?.[0] ??
      null)
    : null;

  // Keyed by workspace so a stale answer can never light the wrong nav.
  const spaceId = current?.id;
  const personalSpace = current ? isPersonal(current) : false;
  const [cloud, setCloud] = useState<{ id: string; enabled: boolean } | null>(
    null,
  );
  const [b2b, setB2b] = useState<{ id: string; status: B2bStatus } | null>(
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
    const probe = () => {
      if (personalSpace) return;
      void b2bService
        .status(spaceId)
        .then((status) => {
          if (alive) setB2b({ id: spaceId, status });
        })
        .catch(() => {
          if (alive) setB2b(null);
        });
    };
    probe();
    window.addEventListener("workspaces:changed", probe);
    window.addEventListener("focus", probe);
    const timer = window.setInterval(probe, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("workspaces:changed", probe);
      window.removeEventListener("focus", probe);
    };
  }, [spaceId, personalSpace]);

  const links = current
    ? workspaceLinks(current, {
        cloudEnabled: !!cloud && cloud.id === spaceId && cloud.enabled,
        managementEnabled: current.managementEnabled !== false,
        role: current.role,
        b2b: b2b && b2b.id === spaceId ? b2b.status : undefined,
      })
    : PERSONAL_FALLBACK;
  const base =
    current && !isPersonal(current)
      ? `/dashboard/workspaces/${current.id}`
      : "/dashboard";

  return (
    <Context.Provider
      value={{ rows, failed, reload: load, teams, current, base, links }}
    >
      {children}
    </Context.Provider>
  );
}
