import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppOpenUrl, isAppLinkId } from "./app-link";

// The desktop side is building `prepix://` registration against this exact
// grammar in parallel (F06.2, superseded by D14): just the workspace. D14
// removes the cloud "team project" — projects exist only locally in the
// desktop app now — so there is nothing left to open but the archive of a
// workspace. A malformed id must refuse here rather than reach the OS as a
// broken link.

const WORKSPACE = "0d1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071";

test("builds the exact URL for a valid workspace id", () => {
  assert.equal(
    buildAppOpenUrl({ workspaceId: WORKSPACE }),
    `prepix://open?workspace=${WORKSPACE}`,
  );
});

test("refuses a missing or empty id", () => {
  assert.equal(buildAppOpenUrl({ workspaceId: "" }), null);
});

test("refuses a non-UUID id", () => {
  assert.equal(buildAppOpenUrl({ workspaceId: "not-a-uuid" }), null);
  assert.equal(buildAppOpenUrl({ workspaceId: "12345" }), null);
});

test("refuses an uppercase UUID — the grammar is lowercase only", () => {
  assert.equal(buildAppOpenUrl({ workspaceId: WORKSPACE.toUpperCase() }), null);
});

test("refuses a path, query, or extra field smuggled into the id", () => {
  assert.equal(
    buildAppOpenUrl({ workspaceId: `${WORKSPACE}/../secrets` }),
    null,
  );
  assert.equal(
    buildAppOpenUrl({ workspaceId: `${WORKSPACE}?token=x` }),
    null,
  );
});

test("isAppLinkId agrees with buildAppOpenUrl's validation", () => {
  assert.ok(isAppLinkId(WORKSPACE));
  assert.ok(!isAppLinkId(WORKSPACE.toUpperCase()));
  assert.ok(!isAppLinkId("not-a-uuid"));
});
