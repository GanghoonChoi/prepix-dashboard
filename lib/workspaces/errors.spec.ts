import { test } from "node:test";
import assert from "node:assert/strict";
import { contentGone, capabilityFailure } from "./errors";
import { workspaceError } from "./onboarding";

// Pins BLOCKER 1. Revert `if (contentGone(code)) setData(null)` back to an
// unconditional `setData(null)` and the classification below stops being
// consulted: a three-second wifi drop unmounts the page and takes a half-typed
// invitation list with it.
test("a transient failure keeps the screen; only a gone workspace clears it", () => {
  const dropped = { request: {}, message: "Network Error" };
  const timeout = { code: "ECONNABORTED", message: "timeout of 15000ms" };
  const overloaded = { response: { status: 503 } };
  const throttled = { response: { status: 429 } };
  for (const failure of [dropped, timeout, overloaded, throttled])
    assert.equal(
      contentGone(workspaceError(failure)),
      false,
      JSON.stringify(failure),
    );

  const missing = { response: { status: 404 } };
  const revoked = { response: { status: 403, data: { message: "WORKSPACE_NOT_FOUND" } } };
  const suspended = {
    response: { status: 403, data: { message: "WORKSPACE_MEMBER_SUSPENDED" } },
  };
  for (const failure of [missing, revoked, suspended])
    assert.equal(
      contentGone(workspaceError(failure)),
      true,
      JSON.stringify(failure),
    );
});

// Pins BLOCKER 3. Collapsing every failure into `{capabilities: null}` rendered
// "the team product does not exist" for a timeout and hid the nav entry.
test("an unanswered capability probe is not the same as a server without the feature", () => {
  // 404 is an answer: this server predates team workspaces. The e2e asserts
  // this path still renders WORKSPACES_DISABLED.
  assert.equal(capabilityFailure({ response: { status: 404 } }), "absent");
  assert.equal(capabilityFailure({ response: { status: 403 } }), "absent");

  // These are not answers at all and must offer a retry.
  assert.equal(capabilityFailure({ code: "ECONNABORTED" }), "unreachable");
  assert.equal(capabilityFailure({ request: {} }), "unreachable");
  assert.equal(capabilityFailure({ response: { status: 500 } }), "unreachable");
  assert.equal(capabilityFailure({ response: { status: 502 } }), "unreachable");
  assert.equal(capabilityFailure(new Error("boom")), "unreachable");
});
