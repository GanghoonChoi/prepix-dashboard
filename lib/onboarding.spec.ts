import { test } from "node:test";
import assert from "node:assert/strict";
import { readStartState, startHref } from "./onboarding";

test("first run starts at the join offer, without assuming a workspace or an install", () => {
  assert.deepEqual(readStartState(""), { step: "join", workspace: null });
});

test("a reload preserves the step someone reached, not a claimed completion", () => {
  for (const step of ["workspace", "invite", "app", "edit"] as const) {
    const state = { step, workspace: null };
    assert.deepEqual(
      readStartState(
        new URL(startHref(state, "ko"), "https://dashboard.laskerstudio.com")
          .search,
      ),
      state,
    );
  }
});

test("only a workspace identifier is carried; the page still verifies membership with the server", () => {
  const id = "12345678-1234-1234-1234-123456789abc";
  assert.deepEqual(readStartState(`?workspace=${id}&step=invite`), {
    step: "invite",
    workspace: id,
  });
  // Anything that is not a plain UUID is dropped rather than interpolated into
  // an API path.
  assert.equal(
    readStartState("?workspace=../invitations/secret").workspace,
    null,
  );
  assert.equal(readStartState("?step=complete").step, "join");
  // The old `mode=personal|team` split is gone: there is one workspace, so
  // there is nothing to choose between. A stale link falls back to the start.
  assert.equal(readStartState("?mode=personal").step, "join");
});
