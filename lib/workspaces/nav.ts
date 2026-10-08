import type { B2bStatus } from "../api/generated/b2b";
import { isPersonal } from "./kind";

/**
 * One nav, computed once, rendered in the sidebar.
 *
 * This used to live inside the workspace pages as a row of tabs, which meant
 * the dashboard carried three navigations at once: a sidebar listing the
 * ACCOUNT's pages, a breadcrumb, and these tabs. Picking "Lasker" in the
 * switcher changed the tabs and left the sidebar saying "개인 계정", so the
 * switcher chose a space that the nav beside it did not belong to.
 *
 * A personal space has no team chrome — not disabled, absent (spec D13 §2.3).
 * Members, seats and roles are statements about other people, and there are no
 * other people here. Nothing to invite into is nothing to invite into by
 * mistake, which is the whole guardrail.
 */
export type NavGroup = "work" | "team" | "manage";
export type NavIcon =
  | "home"
  | "archive"
  | "folder"
  | "members"
  | "plan"
  | "settings";
export type NavLink = {
  href: string;
  ko: string;
  en: string;
  group: NavGroup;
  icon: NavIcon;
};

/** Sidebar section headings, in order. A group with no links is not drawn. */
export const NAV_GROUPS: { key: NavGroup; ko: string; en: string }[] = [
  { key: "work", ko: "작업", en: "Work" },
  { key: "team", ko: "팀", en: "Team" },
  { key: "manage", ko: "관리", en: "Manage" },
];

export function workspaceLinks(
  workspace: { id: string; type?: string },
  options: {
    cloudEnabled: boolean;
    managementEnabled: boolean;
    /**
     * This viewer's role. Only used to drop an entry that would open onto a
     * refusal: a reviewer does not reach the archive at all, and a nav that
     * offers it anyway contradicts the role table two clicks away.
     */
    role?: string;
    b2b?: B2bStatus;
  },
): NavLink[] {
  const base = `/dashboard/workspaces/${workspace.id}`;
  const personal = isPersonal(workspace);

  // The personal space already had a fuller set of pages under /dashboard —
  // credits, usage, billing — built before workspaces existed. Pointing the
  // personal entries at the thin /workspaces/<id> copies would have given the
  // account two overviews that disagree, so the personal space keeps its own
  // routes and only borrows the archive.
  if (personal) {
    return [
      { href: "/dashboard", ko: "홈", en: "Home", group: "work", icon: "home" },
      ...(options.cloudEnabled
        ? ([
            {
              href: `${base}/media`,
              ko: "아카이브",
              en: "Archive",
              group: "work",
              icon: "archive",
            },
          ] as const)
        : []),
      // Usage is a tab of this page now (navActive lights it there too).
      {
        href: "/dashboard/plan",
        ko: "플랜과 결제",
        en: "Plan & billing",
        group: "manage",
        icon: "plan",
      },
      {
        href: "/dashboard/settings",
        ko: "설정",
        en: "Settings",
        group: "manage",
        icon: "settings",
      },
    ];
  }

  /*
    Every entry belongs to the workspace, and that is the point.

    An organisation and a workspace are the same thing — the database enforces
    one workspace per organisation — but the client modelled them as two, so
    멤버 and 플랜과 결제 pointed at /dashboard/organizations/<id>/… while the
    equivalent workspace pages sat beside them unreachable. That is how the
    product came to have two member screens with different invite forms, two
    role tables that disagreed, and seat figures on the one nobody could reach.

    It also made these hrefs depend on an organisation list fetched after
    mount: before it landed the nav pointed at the workspace pages, after it
    landed at the organisation ones, so the same sidebar entry opened a
    different screen depending on a race.
  */
  if (options.b2b?.enrolled) {
    const status = options.b2b;
    return [
      { href: base, ko: "홈", en: "Home", group: "work", icon: "home" },
      // 2026-10-08 cleanup: folders are the one place for team work. 보관함,
      // 편집 이용권 and 이용 상태 keep their routes but leave the nav: seats are
      // handed out on 멤버, and home links the status page when it matters.
      ...(status.allowedActions.projects
        ? ([
            {
              href: `${base}/projects`,
              ko: "폴더",
              en: "Folders",
              group: "work",
              icon: "folder",
            },
          ] as const)
        : []),
      ...(status.team.legacyArchive &&
      options.cloudEnabled &&
      options.role !== "reviewer"
        ? ([
            {
              href: `${base}/media`,
              ko: "기존 아카이브",
              en: "Legacy archive",
              group: "work",
              icon: "archive",
            },
          ] as const)
        : []),
      ...(status.allowedActions.manage && status.team.currentState === "active"
        ? ([
            {
              href: `${base}/members`,
              ko: "멤버",
              en: "Members",
              group: "team",
              icon: "members",
            },
          ] as const)
        : []),
      ...(status.allowedActions.billing
        ? ([
            {
              href: `${base}/plan`,
              ko: "플랜과 결제",
              en: "Plan & billing",
              group: "manage",
              icon: "plan",
            },
          ] as const)
        : []),
      ...(status.allowedActions.manage
        ? ([
            {
              href: `${base}/settings`,
              ko: "설정",
              en: "Settings",
              group: "manage",
              icon: "settings",
            },
          ] as const)
        : []),
    ];
  }
  return [
    { href: base, ko: "홈", en: "Home", group: "work", icon: "home" },
    ...(options.cloudEnabled && options.role !== "reviewer"
      ? ([
          {
            href: `${base}/media`,
            ko: "아카이브",
            en: "Archive",
            group: "work",
            icon: "archive",
          },
        ] as const)
      : []),
    {
      href: `${base}/members`,
      ko: "멤버",
      en: "Members",
      group: "team",
      icon: "members",
    },
    {
      href: `${base}/plan`,
      ko: "플랜과 결제",
      en: "Plan & billing",
      group: "manage",
      icon: "plan",
    },
    // No activity entry. The audit trail is still recorded and the page is
    // still at `${base}/activity`, but nobody was going there on purpose and a
    // nav is worth what its least-used row costs the rows above it.
    ...(options.managementEnabled
      ? ([
          {
            href: `${base}/settings`,
            ko: "설정",
            en: "Settings",
            group: "manage",
            icon: "settings",
          },
        ] as const)
      : []),
  ];
}

/**
 * Exact match for the overview, prefix for everything below it — otherwise the
 * overview stays lit on every child page.
 */
export function navActive(pathname: string, href: string, base: string) {
  // Both overviews are prefixes of every page beneath them, so they have to
  // match exactly or they stay lit on all of their own children.
  const isOverview = href === base || href === "/dashboard";
  // 플랜과 결제 is lit on its other tabs: usage (personal), statements (team).
  if (href.endsWith("/plan")) {
    const tab =
      href === "/dashboard/plan"
        ? "/dashboard/usage"
        : href.replace(/\/plan$/, "/statements");
    if (pathname.startsWith(tab)) return true;
  }
  return isOverview ? pathname === href : pathname.startsWith(href);
}
