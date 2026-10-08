import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSurfaces, projectTabs, visibilityChange } from "./visibility";

test("only working participants see a project's people", () => {
  for (const role of ["viewer", "reviewer"] as const)
    assert.deepEqual(projectSurfaces(role), { people: false });
  for (const role of ["lead", "producer"] as const)
    assert.deepEqual(projectSurfaces(role), { people: true });
});

test("one confirm click changes visibility; the reason names the change", () => {
  assert.deepEqual(visibilityChange({ visibility: "team", revision: 4 }), { visibility: "private", revision: 4, reason: "비공개로 변경" });
  assert.deepEqual(visibilityChange({ visibility: "private", revision: 7 }), {
    visibility: "team",
    revision: 7,
    confirmTeamWide: true,
    reason: "팀 전체 공개로 변경",
  });
});

test("a folder is its videos and files; 멤버 only where a roster matters", () => {
  const labels = (role: Parameters<typeof projectTabs>[1], visibility: "team" | "private") =>
    projectTabs("/f", role, visibility).map((t) => t.ko);
  assert.deepEqual(labels("lead", "team"), ["영상", "자료", "멤버"]);
  assert.deepEqual(labels("producer", "team"), ["영상", "자료"]);
  assert.deepEqual(labels("producer", "private"), ["영상", "자료", "멤버"]);
  // A reviewer or a team viewer never gets the roster.
  assert.deepEqual(labels("reviewer", "private"), ["영상", "자료"]);
  assert.deepEqual(labels("viewer", "team"), ["영상", "자료"]);
  // 영상 stays lit on the review pages beneath it.
  assert.equal(projectTabs("/f", "lead", "team")[0].match, "/f/reviews");
});
