import { test } from "node:test";
import assert from "node:assert/strict";
import { accessNotice, deletionCopy, isTeamStateCode, kst } from "./view";
import type { TeamLifecycle } from "@/lib/api/generated/b2b";

test("S26 shows exact KST instants with seconds", () => {
  assert.equal(kst("2026-10-05T15:00:01.000Z", "ko").endsWith("KST"), true);
  assert.match(kst("2026-10-05T15:00:01.000Z", "en"), /06\/10\/2026, 00:00:01 KST/);
});

test("S32 notices exist for every team-state refusal and never for others", () => {
  for (const code of ["B2B_TEAM_READ_ONLY", "B2B_TEAM_RECOVERY", "B2B_TEAM_DELETION_DUE", "B2B_TEAM_DELETING", "B2B_TEAM_DELETED"]) {
    assert.ok(isTeamStateCode(code));
    assert.ok(accessNotice(code));
  }
  // A network failure or a hidden project is never presented as deletion.
  for (const code of ["REQUEST_FAILED", "B2B_PROJECT_NOT_FOUND", "B2B_TEAM_NOT_FOUND"]) {
    assert.equal(isTeamStateCode(code), false);
    assert.equal(accessNotice(code), null);
  }
});

test("S26 deletion line follows the server state, not the clock", () => {
  const base = { currentState: "deletion_due", deletion: { state: "not_started", preparing: false, startedAt: null, completedAt: null, backup: null } } as unknown as TeamLifecycle;
  assert.match(deletionCopy(base)[0], /복구할 수 있습니다/);
  assert.match(deletionCopy({ ...base, currentState: "deleting", deletion: { ...base.deletion, state: "running" } })[0], /복구할 수 없습니다/);
  assert.match(deletionCopy({ ...base, deletion: { ...base.deletion, state: "ops_check" } })[0], /결제 확인/);
  // Pre-start checks promise no start time; the copy names no payment fact.
  for (const state of ["waiting", "held", "ops_check"] as const) {
    const [ko, en] = deletionCopy({ ...base, deletion: { ...base.deletion, state, preparing: true } });
    assert.match(ko, /시작 시각은 아직 확정되지 않았습니다/);
    assert.doesNotMatch(ko + en, /결제|payment|운영|operations|보류|held/i);
  }
});
