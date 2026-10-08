import { test } from "node:test";
import assert from "node:assert/strict";
import { pickHome } from "./home";

const personal = { id: "p", type: "personal" };
const team = { id: "t", type: "team" };

test("team users land on their team; everyone else on the personal home", () => {
  assert.equal(pickHome("team", [personal, team]), "/dashboard/workspaces/t");
  assert.equal(pickHome("team", [personal]), "/dashboard");
  assert.equal(pickHome("personal", [personal, team]), "/dashboard");
  assert.equal(pickHome(null, [team]), "/dashboard");
});

test("a team you are suspended from is never the landing", () => {
  const suspended = { id: "s", type: "team", suspendedAt: "2026-10-01T00:00:00Z" };
  assert.equal(pickHome("team", [personal, suspended]), "/dashboard");
  assert.equal(pickHome("team", [personal, suspended, team]), "/dashboard/workspaces/t");
});
