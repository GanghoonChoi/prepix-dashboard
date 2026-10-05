import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceLinks, navActive } from "./nav";

const team = { id: "w1", type: "team" };
const hrefs = (options: Parameters<typeof workspaceLinks>[1]) =>
  workspaceLinks(team, options).map((link) => link.href);

test("every team entry belongs to the workspace it names", () => {
  const links = hrefs({ cloudEnabled: true, managementEnabled: true });
  assert.deepEqual(links, [
    "/dashboard/workspaces/w1",
    "/dashboard/workspaces/w1/media",
    "/dashboard/workspaces/w1/members",
    "/dashboard/workspaces/w1/plan",
    "/dashboard/workspaces/w1/settings",
  ]);
  // The organisation routes are gone; an href pointing at one is the
  // regression that made this nav change shape after mount.
  assert.ok(!links.some((href) => href.includes("/organizations/")));
});

test("a reviewer is not offered the archive it cannot open", () => {
  assert.ok(
    !hrefs({
      cloudEnabled: true,
      managementEnabled: true,
      role: "reviewer",
    }).includes("/dashboard/workspaces/w1/media"),
  );
  assert.ok(
    hrefs({
      cloudEnabled: true,
      managementEnabled: true,
      role: "editor",
    }).includes("/dashboard/workspaces/w1/media"),
  );
});

test("a personal space carries no team chrome", () => {
  const personal = workspaceLinks(
    { id: "p1", type: "personal" },
    { cloudEnabled: true, managementEnabled: true },
  ).map((link) => link.href);
  assert.ok(!personal.some((href) => href.endsWith("/members")));
  assert.ok(
    !personal.some(
      (href) => href.endsWith("/plan") && href.includes("workspaces"),
    ),
  );
});

test("the overview does not stay lit on its own children", () => {
  const base = "/dashboard/workspaces/w1";
  assert.equal(navActive(`${base}/members`, base, base), false);
  assert.equal(navActive(base, base, base), true);
  assert.equal(navActive(`${base}/members`, `${base}/members`, base), true);
});

test("team AI usage stays scoped to enrolled teams with current project reading access", () => {
  const b2b = {
    enabled: true,
    enrolled: true,
    team: {
      workspaceId: "w1",
      policyVersion: "v1",
      currentState: "active",
      state: "active",
      periodStartsAt: null,
      periodEndsAt: null,
      legacyArchive: false,
      revision: 0,
    },
    member: { kind: "internal", billingAllowed: false, revision: 0 },
    allowedActions: {
      projects: true,
      createProject: false,
      manage: false,
      billing: false,
    },
  } as const;
  const options = { cloudEnabled: false, managementEnabled: false, b2b };
  assert.ok(hrefs(options).includes("/dashboard/workspaces/w1/ai"));
  assert.ok(
    !hrefs({
      ...options,
      b2b: {
        ...b2b,
        allowedActions: { ...b2b.allowedActions, projects: false },
      },
    }).includes("/dashboard/workspaces/w1/ai"),
  );
  assert.ok(
    !hrefs({ cloudEnabled: false, managementEnabled: false }).some((link) =>
      link.endsWith("/ai"),
    ),
  );
  assert.ok(
    !workspaceLinks({ id: "p1", type: "personal" }, options).some((link) =>
      link.href.endsWith("/ai"),
    ),
  );
});
