import type { ReviewDetail } from "../api/generated/b2b";

export type ExactReviewTarget = { round: number; versionId: string };
const changed = () => Object.assign(new Error("B2B_REVIEW_TARGET_CHANGED"), {
  response: { status: 404, data: { message: "B2B_REVIEW_TARGET_CHANGED" } },
});
export function parseExactReviewTarget(query: Pick<URLSearchParams, "getAll">): ExactReviewTarget | undefined {
  const rounds = query.getAll("round"), versions = query.getAll("versionId");
  if (!rounds.length && !versions.length) return undefined;
  const round = Number(rounds[0]);
  if (rounds.length !== 1 || versions.length !== 1 || !/^[1-9]\d*$/.test(rounds[0]) ||
    !Number.isSafeInteger(round) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versions[0])) throw changed();
  return { round, versionId: versions[0] };
}
/** A new publication must never turn a desktop exact-version entry into latest. */
export function checkExactReviewTarget(detail: ReviewDetail, reviewId: string, target: ExactReviewTarget) {
  const selected = detail.rounds.filter(r => r.round === target.round);
  if (detail.review.id !== reviewId || detail.selectedRound !== target.round || selected.length !== 1 ||
    selected[0].versionId !== target.versionId || detail.preview.versionId !== target.versionId ||
    detail.comments.some(c => c.round !== target.round || c.versionId !== target.versionId) ||
    detail.decisions.some(d => d.round !== target.round || d.versionId !== target.versionId)) throw changed();
  return detail;
}
export function assertExactReviewEntry(
  scope: { origin: string; userId: string; workspaceId: string; projectId: string; reviewId: string },
  target: ExactReviewTarget,
  current: { origin: string; userId: string | null; signedIn: boolean; pathname: string },
  search: string,
) {
  const pin = parseExactReviewTarget(new URLSearchParams(search));
  if (!current.signedIn || current.userId !== scope.userId || current.origin !== scope.origin ||
    current.pathname !== `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/reviews/${scope.reviewId}` ||
    pin?.round !== target.round || pin.versionId !== target.versionId) throw changed();
}
