import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  append,
  current,
  describe,
  href,
  notificationErrorCode,
  scopeKey,
  type NotificationScope,
} from "./notifications";
import type { UserNotification } from "../api/generated/b2b";

const scope: NotificationScope = {
  userId: randomUUID(),
  workspaceId: null,
  filter: "all",
};
const item = (patch: Partial<UserNotification> = {}): UserNotification => ({
  id: randomUUID(),
  kind: "request.assigned",
  createdAt: "2026-10-06T00:00:00.000Z",
  readAt: null,
  access: "current",
  team: { id: randomUUID(), name: "Team" },
  project: { id: randomUUID(), name: "Secret campaign" },
  params: { role: "assignee" },
  ...patch,
});

test("late responses for another account, team or filter are dropped", () => {
  const body = { currentUserId: scope.userId, items: [] };
  assert.equal(current(body, scope, scope), body);
  assert.equal(
    current(body, scope, { ...scope, workspaceId: randomUUID() }),
    null,
  );
  assert.equal(current(body, scope, { ...scope, filter: "unread" }), null);
  assert.equal(
    current({ ...body, currentUserId: randomUUID() }, scope, scope),
    null,
  );
  assert.notEqual(
    scopeKey(scope),
    scopeKey({ ...scope, userId: randomUUID() }),
  );
});

test("pages append without repeating an item", () => {
  const [a, b, c] = [item(), item(), item()];
  assert.deepEqual(
    append([a, b], [b, c]).map((n) => n.id),
    [a.id, b.id, c.id],
  );
});

test("a lost notification renders generic text with no names", () => {
  const lost = item({ access: "lost", team: null, project: null, params: {} });
  for (const ko of [true, false]) {
    const text = describe(lost, ko);
    assert.ok(!text.includes("Secret") && !text.includes("Team"));
  }
  assert.equal(describe(item(), true), "요청 담당자로 지정됐어요");
  assert.equal(
    describe(item({ params: { role: "confirmer" } }), true),
    "요청 확인자로 지정됐어요",
  );
  assert.match(
    describe(
      item({
        kind: "notice.period_ending",
        params: { periodEndsAt: "2026-10-09T09:00:00.000Z" },
      }),
      true,
    ),
    /2026\. 10\. 09\. 18:00 KST/,
  );
});

test("destinations map to the screens that recheck access themselves", () => {
  const w = randomUUID(),
    p = randomUUID(),
    r = randomUUID();
  assert.equal(
    href({ kind: "request", workspaceId: w, projectId: p, requestId: r }),
    `/dashboard/workspaces/${w}/projects/${p}/requests/${r}`,
  );
  assert.equal(
    href({ kind: "project_files", workspaceId: w, projectId: p }),
    `/dashboard/workspaces/${w}/projects/${p}/files`,
  );
  assert.equal(
    href({ kind: "team_status", workspaceId: w }),
    `/dashboard/workspaces/${w}/status`,
  );
  assert.equal(
    href({ kind: "billing", workspaceId: w }),
    `/dashboard/workspaces/${w}/plan`,
  );
  assert.equal(
    href({ kind: "library", workspaceId: w }),
    `/dashboard/workspaces/${w}/library`,
  );
});

test("a missing date never leaves a dangling clause", () => {
  for (const kind of [
    "lifecycle.ops_check",
    "lifecycle.period_ended",
    "lifecycle.recovery_storage",
    "notice.period_ending",
    "notice.deletion_scheduled",
  ] as const)
    for (const params of [{}, { deadline: null }] as never[])
      for (const ko of [true, false]) {
        const text = describe(item({ kind, params }), ko);
        assert.ok(
          !/KST|까지|부터|\buntil\b|\bfrom\b|\bat\b/.test(text),
          `${kind}: ${text}`,
        );
      }
  assert.match(
    describe(
      item({
        kind: "lifecycle.ops_check",
        params: { deadline: "2026-10-09T09:00:00.000Z" },
      }),
      true,
    ),
    /18:00 KST까지/,
  );
});

test("client-thrown account errors and server errors both yield a code", () => {
  assert.equal(
    notificationErrorCode(new Error("B2B_NOTIFICATION_ACCOUNT_CHANGED")),
    "B2B_NOTIFICATION_ACCOUNT_CHANGED",
  );
  assert.equal(
    notificationErrorCode({ response: { data: { message: "B2B_DISABLED" } } }),
    "B2B_DISABLED",
  );
  assert.equal(
    notificationErrorCode(new Error("Network Error")),
    "REQUEST_FAILED",
  );
  assert.equal(notificationErrorCode(null), "REQUEST_FAILED");
});
