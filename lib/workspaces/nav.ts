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
     * This workspace's organisation. Always present for a team, because one
     * organisation holds exactly one workspace — the database enforces it
     * (`workspaces_one_per_organization`).
     *
     * It used to be `soleOrganizationId`, set only when the organisation held
     * a single workspace, with a fallback to per-workspace members and plan
     * screens for the case where it held several. That case cannot occur:
     * `create()` is the only writer of `organization_id` and mints a fresh
     * organisation every time. The fallback was a second navigation maintained
     * for a state nothing produces.
     */
    organizationId?: string;
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
  // not (D14), so an organisation and a workspace are the same thing and the
  // nav says so once. The `${base}/members` fallback below is for a workspace
  // with no organisation at all — old data, never a second workspace.
  const org = options.organizationId;
  return [
    { href: base, ko: "개요", en: "Overview" },
    ...(options.cloudEnabled
      ? [{ href: `${base}/media`, ko: "아카이브", en: "Archive" }]
      : []),
    {
      href: org
        ? `/dashboard/organizations/${org}/members`
        : `${base}/members`,
      ko: "멤버",
      en: "Members",
    },
    // `결제` and `플랜과 사용량` were showing the same seats and the same
    // storage from two routes. One organisation is one team, so there is one
    // page that carries both.
    ...(org
      ? [
          {
            href: `/dashboard/organizations/${org}/billing`,
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
