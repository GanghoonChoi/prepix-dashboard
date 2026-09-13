import { test } from "node:test";
import assert from "node:assert/strict";
import { readStartState, startHref } from "./onboarding";
test("first visitor chooses a path without assuming authentication or installation", () => {
  assert.deepEqual(readStartState(""), { mode: "choose", step: "install", workspace: null });
});
test("a reload preserves the requested path and instructions, not a claimed completion", () => {
  const state = { mode: "personal", step: "edit", workspace: null } as const;
  assert.deepEqual(
    readStartState(new URL(startHref(state, "ko"), "https://dashboard.laskerstudio.com").search),
    state,
  );
});
test("only a workspace identifier is carried; the page still verifies membership with the server", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.deepEqual(readStartState(`?workspace=${id}`), {
    mode: "team",
    step: "install",
    workspace: id,
  });
  assert.equal(readStartState("?workspace=../invitations/secret").workspace, null);
  assert.equal(readStartState("?mode=admin&step=complete").mode, "choose");
  assert.equal(readStartState("?mode=team&step=complete").step, "install");
});
