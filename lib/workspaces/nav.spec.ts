import { test } from "node:test";
import assert from "node:assert/strict";
import { workspaceLinks, navActive } from "./nav";

const team = { id: "w1", type: "team" };
const hrefs = (options: Parameters<typeof workspaceLinks>[1]) =>
  workspaceLinks(team, options).map((link) => link.href);

test("every team entry belongs to the workspace it names", () => {
  const links = hrefs({ cloudEnabled: true, managementEnabled: true, role: "owner" });
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

test("a team has no web AI entry: team AI runs in the app on the person's seat", () => {
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
    member: { kind: "internal", billingAllowed: true, revision: 0 },
    allowedActions: {
      projects: true,
      createProject: true,
      manage: true,
      billing: true,
    },
  } as const;
  assert.ok(
    !hrefs({ cloudEnabled: true, managementEnabled: true, b2b }).some((href) =>
      href.endsWith("/ai"),
    ),
  );
});

test("a team's nav is folders, people, billing and settings", () => {
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
    member: { kind: "internal", billingAllowed: true, revision: 0 },
    allowedActions: { projects: true, createProject: true, manage: true, billing: true },
  } as const;
  const base = "/dashboard/workspaces/w1";
  assert.deepEqual(hrefs({ cloudEnabled: true, managementEnabled: true, b2b }), [
    base,
    `${base}/projects`,
    `${base}/members`,
    `${base}/plan`,
    `${base}/settings`,
  ]);
});

test("plan and settings are for owners and admins only", () => {
  const base = "/dashboard/workspaces/w1";
  for (const role of ["editor", "reviewer"])
    assert.deepEqual(
      hrefs({ cloudEnabled: false, managementEnabled: true, role }),
      [base, `${base}/members`],
    );
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
    allowedActions: { projects: true, createProject: true, manage: false, billing: false },
  } as const;
  assert.deepEqual(hrefs({ cloudEnabled: true, managementEnabled: true, b2b }), [
    base,
    `${base}/projects`,
  ]);
});

test("a viewer gets the projects shared with them and nothing else", () => {
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
      legacyArchive: true,
      revision: 0,
    },
    member: { kind: "external", billingAllowed: false, revision: 0 },
    allowedActions: { projects: true, createProject: false, manage: false, billing: false },
  } as const;
  const options = { cloudEnabled: true, managementEnabled: true, b2b, role: "reviewer" };
  assert.deepEqual(hrefs(options), ["/dashboard/workspaces/w1/projects"]);
  assert.deepEqual(
    hrefs({ ...options, b2b: { ...b2b, allowedActions: { ...b2b.allowedActions, projects: false } } }),
    [],
  );
});

test("monthly statements follow current billing permission, never project access", () => {
  const b2b = {
    enabled: true,
    enrolled: true,
    team: {
      workspaceId: "w1",
      policyVersion: "v1",
      currentState: "read_only",
      state: "active",
      periodStartsAt: null,
      periodEndsAt: null,
      legacyArchive: false,
      revision: 0,
    },
    member: { kind: "internal", billingAllowed: true, revision: 0 },
    allowedActions: {
      projects: false,
      createProject: false,
      manage: false,
      billing: true,
    },
  } as const;
  const options = { cloudEnabled: false, managementEnabled: false, b2b };
  // Statements are a tab of 플랜과 결제: the entry exists with billing
  // permission and stays lit on the statements pages.
  assert.ok(hrefs(options).includes("/dashboard/workspaces/w1/plan"));
  assert.ok(!hrefs(options).includes("/dashboard/workspaces/w1/statements"));
  const base = "/dashboard/workspaces/w1";
  assert.equal(navActive(`${base}/statements/2026-09`, `${base}/plan`, base), true);
  assert.ok(
    !hrefs({
      ...options,
      b2b: {
        ...b2b,
        allowedActions: {
          ...b2b.allowedActions,
          projects: true,
          billing: false,
        },
      },
    }).includes("/dashboard/workspaces/w1/plan"),
  );
  assert.ok(
    !workspaceLinks({ id: "p1", type: "personal" }, options).some((link) =>
      link.href.endsWith("/statements"),
    ),
  );
});

test("usage is a tab of plan & billing, so the plan entry stays lit there", () => {
  assert.equal(
    navActive("/dashboard/usage", "/dashboard/plan", "/dashboard"),
    true,
  );
  assert.equal(
    navActive("/dashboard/usage", "/dashboard", "/dashboard"),
    false,
  );
  const personal = workspaceLinks(
    { id: "p1", type: "personal" },
    { cloudEnabled: false, managementEnabled: true },
  );
  assert.ok(!personal.some((link) => link.href === "/dashboard/usage"));
});

test("a personal space draws no 팀 section", () => {
  const groups = workspaceLinks(
    { id: "p1", type: "personal" },
    { cloudEnabled: true, managementEnabled: true },
  ).map((link) => link.group);
  assert.ok(!groups.includes("team"));
  assert.deepEqual(new Set(groups), new Set(["work", "manage"]));
});
