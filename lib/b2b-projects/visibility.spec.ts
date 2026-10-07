import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSurfaces, projectTabs, visibilityChange } from "./visibility";

test("a team viewer loads no work surface; participants keep their v1 surfaces", () => {
  assert.deepEqual(projectSurfaces("viewer"), {
    requests: false, requestWork: false, delivery: false, publications: false, people: false, app: false,
  });
  assert.deepEqual(projectSurfaces("reviewer"), {
    requests: true, requestWork: true, delivery: true, publications: true, people: false, app: false,
  });
  for (const role of ["lead", "producer"] as const)
    assert.ok(Object.values(projectSurfaces(role)).every(Boolean));
});

test("narrowing to private sends an optional reason and no confirmation", () => {
  assert.deepEqual(visibilityChange({ visibility: "team", revision: 4 }, { reason: "  ", confirmed: false }), { visibility: "private", revision: 4 });
  assert.deepEqual(visibilityChange({ visibility: "team", revision: 4 }, { reason: " 외주 계약 ", confirmed: false }), { visibility: "private", revision: 4, reason: "외주 계약" });
});

test("widening to team needs the confirmation and a reason before anything is sent", () => {
  const project = { visibility: "private" as const, revision: 7 };
  assert.throws(() => visibilityChange(project, { reason: "공유", confirmed: false }), { message: "B2B_PROJECT_VISIBILITY_CONFIRMATION_REQUIRED" });
  assert.throws(() => visibilityChange(project, { reason: " ", confirmed: true }), { message: "B2B_REASON_REQUIRED" });
  assert.deepEqual(visibilityChange(project, { reason: " 팀 공유 ", confirmed: true }), { visibility: "team", revision: 7, confirmTeamWide: true, reason: "팀 공유" });
});

test("folder tabs follow the same surfaces as the pages behind them", () => {
  const labels = (role: Parameters<typeof projectTabs>[1]) =>
    projectTabs("/f", role).map((t) => t.ko);
  assert.deepEqual(labels("lead"), ["개요", "자료", "영상 검토", "요청사항", "참여자", "납품"]);
  // A reviewer works in reviews and requests, never the roster.
  assert.ok(!labels("reviewer").includes("참여자"));
  // A team viewer reads; no requests, delivery or roster.
  assert.deepEqual(labels("viewer"), ["개요", "자료", "영상 검토"]);
});
