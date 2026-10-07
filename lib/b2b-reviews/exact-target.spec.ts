import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReviewDetail } from "../api/generated/b2b";
import { assertExactReviewEntry, checkExactReviewTarget, parseExactReviewTarget } from "./exact-target";
const versionId = "00000000-0000-4000-8000-000000000001";
const target = { round: 1, versionId };
const detail = () => ({ review: { id: "review", round: 2 }, selectedRound: 1,
  rounds: [{ round: 1, versionId }, { round: 2, versionId: "new" }],
  preview: { versionId }, comments: [], decisions: [] }) as unknown as ReviewDetail;
test("ordinary review stays unpinned; exact entry requires one complete valid pin", () => {
  assert.equal(parseExactReviewTarget(new URLSearchParams()), undefined);
  assert.deepEqual(parseExactReviewTarget(new URLSearchParams({ round: "1", versionId })), target);
  for (const query of ["round=1", `versionId=${versionId}`, `round=0&versionId=${versionId}`,
    `round=1.1&versionId=${versionId}`, `round=01&versionId=${versionId}`, `round=1&round=2&versionId=${versionId}`,
    `round=1&versionId=${versionId}&versionId=${versionId}`, "round=1&versionId=wrong",
    `round=9007199254740992&versionId=${versionId}`])
    assert.throws(() => parseExactReviewTarget(new URLSearchParams(query)), /TARGET_CHANGED/);
});
test("a newer current round preserves the selected original round", () => {
  const value = detail();
  assert.equal(checkExactReviewTarget(value, "review", target), value);
});
test("foreign or mixed version responses cannot become the pinned result", () => {
  const mutants = [
    (d: ReviewDetail) => { d.review.id = "other"; },
    (d: ReviewDetail) => { d.selectedRound = 2; },
    (d: ReviewDetail) => { d.rounds[0].versionId = "other"; },
    (d: ReviewDetail) => { d.rounds.push(d.rounds[0]); },
    (d: ReviewDetail) => { d.preview.versionId = "other"; },
    (d: ReviewDetail) => { d.comments = [{ round: 2, versionId }] as ReviewDetail["comments"]; },
    (d: ReviewDetail) => { d.decisions = [{ round: 1, versionId: "other" }] as ReviewDetail["decisions"]; },
  ];
  for (const mutate of mutants) { const d = detail(); mutate(d); assert.throws(() => checkExactReviewTarget(d, "review", target), /TARGET_CHANGED/); }
});
test("account, origin, route, logout and query changes reject awaited exact entry", () => {
  const scope = { origin: "http://api.test", userId: "me", workspaceId: "team", projectId: "project", reviewId: "review" };
  const current = { origin: scope.origin, userId: scope.userId, signedIn: true,
    pathname: "/dashboard/workspaces/team/projects/project/reviews/review" };
  const search = `?round=1&versionId=${versionId}`;
  assertExactReviewEntry(scope, target, current, search);
  for (const change of [{ userId: "new" }, { origin: "http://else.test" }, { signedIn: false }, { pathname: "/dashboard" }])
    assert.throws(() => assertExactReviewEntry(scope, target, { ...current, ...change }, search), /TARGET_CHANGED/);
  assert.throws(() => assertExactReviewEntry(scope, target, current, `?round=2&versionId=${versionId}`), /TARGET_CHANGED/);
});
