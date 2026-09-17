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
export type NavLink = { href: string; ko: string; en: string };

export function workspaceLinks(
  workspace: { id: string; type?: string },
  options: {
    cloudEnabled: boolean;
    managementEnabled: boolean;
    /**
     * Set when this workspace's organisation holds only this workspace, in
     * which case members and billing belong to the same team and are shown
     * here rather than behind a second settings screen.
     */
    soleOrganizationId?: string;
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
      { href: "/dashboard", ko: "개요", en: "Overview" },
      ...(options.cloudEnabled
        ? [{ href: `${base}/media`, ko: "아카이브", en: "Archive" }]
        : []),
      { href: "/dashboard/usage", ko: "사용량", en: "Usage" },
      { href: "/dashboard/plan", ko: "플랜", en: "Plan" },
      { href: "/dashboard/settings", ko: "설정", en: "Settings" },
    ];
  }

  // One archive, one team. The reference products split members and billing
  // off to the layer above because their middle layer multiplies; ours does
  // not (D14), so while an organisation holds exactly one workspace the two
  // are the same thing and the nav says so once. A second workspace makes the
  // distinction real again and the entries move back up on their own.
  const sole = options.soleOrganizationId;
  return [
    { href: base, ko: "개요", en: "Overview" },
    ...(options.cloudEnabled
      ? [{ href: `${base}/media`, ko: "아카이브", en: "Archive" }]
      : []),
    {
      href: sole
        ? `/dashboard/organizations/${sole}/members`
        : `${base}/members`,
      ko: "멤버",
      en: "Members",
    },
    // `결제` and `플랜과 사용량` were showing the same seats and the same
    // storage from two routes. Collapsed, the organisation's billing page is
    // the one that also carries the plan; split, the workspace keeps its own.
    ...(sole
      ? [
          {
            href: `/dashboard/organizations/${sole}/billing`,
            ko: "플랜과 결제",
            en: "Plan and billing",
          },
        ]
      : [{ href: `${base}/plan`, ko: "플랜과 사용량", en: "Plan and usage" }]),
    // No activity entry. The audit trail is still recorded and the page is
    // still at `${base}/activity`, but nobody was going there on purpose and a
    // nav is worth what its least-used row costs the rows above it.
    ...(options.managementEnabled
      ? [{ href: `${base}/settings`, ko: "설정", en: "Settings" }]
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
  return isOverview ? pathname === href : pathname.startsWith(href);
}
