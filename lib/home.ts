import { isPersonal } from "./workspaces/kind";
import { workspaceService } from "./api/services/workspace.service";

/**
 * Someone who chose "with my team" and has one starts there; the personal
 * space is still a click away in the space switcher.
 */
export function pickHome(
  useType: string | null | undefined,
  rows: readonly { id: string; type?: string }[],
) {
  const team =
    useType === "team" ? rows.find((row) => !isPersonal(row)) : undefined;
  return team ? `/dashboard/workspaces/${team.id}` : "/dashboard";
}

/** A failed lookup is not a reason to strand someone: fall back to home. */
export async function homeFor(useType: string | null | undefined) {
  if (useType !== "team") return "/dashboard";
  try {
    return pickHome(useType, (await workspaceService.list()).workspaces);
  } catch {
    return "/dashboard";
  }
}

/**
 * After signing in, the account's own home stands in for the generic
 * "/dashboard" default. An explicit destination — an invitation, a checkout,
 * the desktop hand-off — still wins.
 */
export async function landing(destination: string) {
  if (!destination.startsWith("/") || destination.startsWith("//"))
    return destination;
  const url = new URL(destination, "http://local.invalid");
  if (url.pathname !== "/dashboard") return destination;
  let useType: string | undefined;
  try {
    useType = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.useType;
  } catch {
    // An unreadable cache only means the generic home.
  }
  const home = await homeFor(useType);
  return home === "/dashboard" ? destination : home + url.search;
}
