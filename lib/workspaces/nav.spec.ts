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
  assert.ok(!personal.some((href) => href.endsWith("/plan") && href.includes("workspaces")));
});

test("the overview does not stay lit on its own children", () => {
  const base = "/dashboard/workspaces/w1";
  assert.equal(navActive(`${base}/members`, base, base), false);
  assert.equal(navActive(base, base, base), true);
  assert.equal(navActive(`${base}/members`, `${base}/members`, base), true);
});
