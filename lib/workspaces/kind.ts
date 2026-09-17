import type { Role, Seats } from "../api/services/workspace.service";

/**
 * Personal and team workspaces are different objects (spec D13, which replaced
 * D12's single type).
 *
 * The distinction comes from the server and only from the server. A client-side
 * guess — "the oldest one you own", "the one with a single member" — would
 * silently classify somebody's real team as personal and take its members tab,
 * its invitations and its seat figures away, which is a worse failure than not
 * showing the distinction at all. So an absent `type` reads as `team`: the
 * pre-D13 behaviour, unchanged, until the backend ships the field.
 */
export type WorkspaceKind = "personal" | "team";

export function workspaceKind(workspace: { type?: string }): WorkspaceKind {
  return workspace.type === "personal" ? "personal" : "team";
}

export function isPersonal(workspace: { type?: string }) {
  return workspaceKind(workspace) === "personal";
}

/**
 * Personal first, then teams in the order the server sent them. `sort` is
 * stable, so this reorders the kinds without shuffling anything inside them.
 */
export function personalFirst<T extends { type?: string }>(rows: readonly T[]) {
  return [...rows].sort(
    (a, b) => Number(isPersonal(b)) - Number(isPersonal(a)),
  );
}

export type SeatFigures = {
  limit: number;
  /** Whether `limit` refuses anybody, or is reporting only. */
  enforced: boolean;
  active: number;
  invited: number;
  suspended: number;
  reviewers: number;
  remaining: number;
};

/**
 * Seats as separate numbers, never one total.
 *
 * A Dropbox admin removed 20 licences, watched a single seat total not move,
 * and paid about $3,000 over four to six months — the total silently folded in
 * pending invitations and suspended members. D02 reserves a seat for every
 * unexpired paid invitation, so the identical trap is open to us unless the
 * figures stay split at every surface that shows them. Nothing here returns a
 * sum, on purpose: adding one back is the regression.
 *
 * `seats` is `null` for a personal workspace — it is outside seat accounting
 * altogether, and "0 of 0 seats" is still an invitation to reason about seats
 * in a place that has none. Callers render nothing at all for null.
 *
 * The pre-D13 `{ used, reserved }` shape is still read here so a dashboard
 * deploy on either side of the backend's shows real numbers rather than zeros.
 */
export function seatFigures(detail: {
  seats: Seats | null;
  members: readonly { role: Role; suspendedAt?: string | null }[];
  workspace: { seatLimit: number };
}): SeatFigures | null {
  const { seats, members } = detail;
  if (!seats) return null;
  const limit = seats.limit ?? detail.workspace.seatLimit;
  const active = seats.activeMembers ?? seats.used ?? 0;
  const invited = seats.pendingInvitations ?? seats.reserved ?? 0;
  return {
    limit,
    // The server decides whether that limit refuses anybody; older responses
    // that predate the field were always enforcing.
    enforced: seats.enforced ?? true,
    active,
    invited,
    suspended:
      seats.suspendedMembers ??
      members.filter((m) => m.suspendedAt && m.role !== "reviewer").length,
    reviewers:
      seats.freeReviewers ??
      members.filter((m) => m.role === "reviewer").length,
    // Suspended members and reviewers hold no seat, so they are not subtracted.
    // A pending invitation is, which is the whole point.
    remaining: seats.remaining ?? Math.max(0, limit - active - invited),
  };
}
