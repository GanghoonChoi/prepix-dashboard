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
     * This viewer's role. Only used to drop an entry that would open onto a
     * refusal: a reviewer does not reach the archive at all, and a nav that
     * offers it anyway contradicts the role table two clicks away.
     */
    role?: string;
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
  return [
    { href: base, ko: "개요", en: "Overview" },
    ...(options.cloudEnabled && options.role !== "reviewer"
      ? [{ href: `${base}/media`, ko: "아카이브", en: "Archive" }]
      : []),
    { href: `${base}/members`, ko: "멤버", en: "Members" },
    { href: `${base}/plan`, ko: "플랜과 결제", en: "Plan and billing" },
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
