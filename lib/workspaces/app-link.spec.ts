import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAppOpenUrl, isAppLinkId } from "./app-link";

// The desktop side is building `prepix://` registration against this exact
// grammar in parallel (F06.2): workspace + project, optional version, nothing
// else. A malformed id must refuse here rather than reach the OS as a broken
// link.

const WORKSPACE = "0d1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6071";
const PROJECT = "1a2b3c4d-5e6f-4071-8213-2c3d4e5f6072";
const VERSION = "2a3b4c5d-6e7f-4172-8314-2c3d4e5f6073";

test("builds the exact URL for valid ids, no version", () => {
  assert.equal(
    buildAppOpenUrl({ workspaceId: WORKSPACE, projectId: PROJECT }),
    `prepix://open?workspace=${WORKSPACE}&project=${PROJECT}`,
  );
});

test("adds version only when supplied", () => {
  assert.equal(
    buildAppOpenUrl({
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      versionId: VERSION,
    }),
    `prepix://open?workspace=${WORKSPACE}&project=${PROJECT}&version=${VERSION}`,
  );
});

test("refuses a missing or empty id", () => {
  assert.equal(
    buildAppOpenUrl({ workspaceId: "", projectId: PROJECT }),
    null,
  );
  assert.equal(
    buildAppOpenUrl({ workspaceId: WORKSPACE, projectId: "" }),
    null,
  );
});

test("refuses a non-UUID id", () => {
  assert.equal(
    buildAppOpenUrl({ workspaceId: "not-a-uuid", projectId: PROJECT }),
    null,
  );
  assert.equal(
    buildAppOpenUrl({ workspaceId: WORKSPACE, projectId: "12345" }),
    null,
  );
});

test("refuses an uppercase UUID — the grammar is lowercase only", () => {
  assert.equal(
    buildAppOpenUrl({
      workspaceId: WORKSPACE.toUpperCase(),
      projectId: PROJECT,
    }),
    null,
  );
});

test("refuses a malformed version id without silently dropping it", () => {
  // Emitting the link without `version` would point the app at the wrong
  // thing (the latest version) instead of failing loudly.
  assert.equal(
    buildAppOpenUrl({
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      versionId: "bad",
    }),
    null,
  );
});

test("refuses a path, query, or extra field smuggled into an id", () => {
  assert.equal(
    buildAppOpenUrl({
      workspaceId: `${WORKSPACE}/../secrets`,
      projectId: PROJECT,
    }),
    null,
  );
  assert.equal(
    buildAppOpenUrl({
      workspaceId: WORKSPACE,
      projectId: `${PROJECT}?token=x`,
    }),
    null,
  );
});

test("isAppLinkId agrees with buildAppOpenUrl's validation", () => {
  assert.ok(isAppLinkId(WORKSPACE));
  assert.ok(!isAppLinkId(WORKSPACE.toUpperCase()));
  assert.ok(!isAppLinkId("not-a-uuid"));
});
