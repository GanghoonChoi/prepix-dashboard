import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { api, account, fixture, open, json } from "./b2b-review-helpers";

// 사용량 (2026-10-12): the team's AI time is one pool — per-seat value × seats —
// and everyone's use comes out of it; owners and admins see who used how much.
test("사용량: the team pool and who used it, for owners and admins only", async ({ browser, request }) => {
  test.setTimeout(180_000);
  expect(process.env.WORKSPACES_TEST_DATABASE_URL).toBeTruthy();
  const [owner, editor] = await Promise.all(["tu-owner", "tu-editor"].map((l) => account(request, l)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "사용량 팀", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: editor.id });
  const usage = `${api}/v2/workspaces/${team}/b2b/team-usage`;
  const empty = await json(request.get(usage, { headers: owner.headers }));
  // The test product: 3 seats × 3,000 s.
  expect([empty.seats, empty.perSeatSeconds, empty.poolSeconds, empty.usedSeconds]).toEqual([3, 3000, 9000, 0]);
  expect((await request.get(usage, { headers: editor.headers })).status()).toBe(403);
  // Work in the app lands on each person's row of the pool (the AI routes are
  // not in this harness, so the rows are written directly).
  const psql = (q: string) => execFileSync(process.env.PSQL ?? "psql", [process.env.WORKSPACES_TEST_DATABASE_URL!, "-tAc", q]);
  for (const [who, used] of [[owner, 2700], [editor, 1260]] as const)
    psql(`insert into b2b_team_ai_usage (workspace_id, period_id, user_id, period_start, period_end, limit_seconds, inference_seconds_used)
          values ('${team}', '${empty.period.id}', '${who.id}', now(), now() + interval '30 days', 9000, ${used})`);

  const O = await open(browser, owner, `/dashboard/workspaces/${team}/usage`);
  await O.page.waitForURL((u) => u.pathname.endsWith("/usage"));
  await expect(O.page.getByRole("navigation", { name: "워크스페이스 메뉴" }).getByRole("link", { name: "사용량", exact: true })).toHaveAttribute("aria-current", "page");
  const stats = O.page.getByRole("region", { name: "팀 AI 시간", exact: true });
  await expect(stats).toContainText("남은 시간84분");
  await expect(stats).toContainText("사용한 시간66분");
  await expect(stats).toContainText("팀 전체150분");
  await expect(stats).toContainText("좌석 3개 × 50분");
  const rows = O.page.getByRole("region", { name: "멤버별 사용량", exact: true }).getByRole("row");
  await expect(rows.filter({ hasText: "tu-owner" })).toContainText("45분");
  await expect(rows.filter({ hasText: "tu-editor" })).toContainText("21분");

  // An editor has no 사용량 entry, and the address says no.
  const E = await open(browser, editor, `/dashboard/workspaces/${team}`);
  await E.page.waitForURL((u) => u.pathname === `/dashboard/workspaces/${team}`);
  await expect(E.page.getByRole("navigation", { name: "워크스페이스 메뉴" }).getByRole("link", { name: "사용량", exact: true })).toHaveCount(0);
  await E.page.goto(`/dashboard/workspaces/${team}/usage`);
  await expect(E.page.getByTestId("access-denied")).toContainText("권한이 없습니다");
  for (const view of [O, E]) expect(view.errors).toEqual([]);
  await Promise.all([O, E].map((v) => v.close()));
});
