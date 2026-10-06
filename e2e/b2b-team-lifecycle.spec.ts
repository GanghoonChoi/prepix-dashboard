import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
// S26/S32 against the real Nest/JWT harness and PostgreSQL (F17).
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3308";
const password = "LocalPreview123";
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const DAY = 86400;
function fixture(input: object) {
  execFileSync(process.execPath, [resolve(process.env.B2B_E2E_FIXTURE_DIR ?? "../prepix-backend/backend/scripts", "b2b-team-lifecycle-fixture.cjs"), JSON.stringify(input)], { timeout: 15_000 });
}
async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${suffix()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: label } })).status()).toBe(201);
  const session = (await (await request.post(`${api}/v2/auth/email/login`, { data: { email, password } })).json()).data;
  return { email, id: session.user.id as string, headers: { Authorization: `Bearer ${session.accessToken}` } };
}
async function team(request: APIRequestContext, headers: Record<string, string>, endsInSeconds: number) {
  const created = await request.post(`${api}/v2/workspaces`, { headers, data: { name: `Lifecycle ${suffix()}`, requestKey: crypto.randomUUID() } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.workspace.id as string;
  fixture({ workspaceId: id, action: "period", endsInSeconds });
  return id;
}
async function signIn(page: Page, email: string) {
  await page.goto("/login?returnTo=%2Fdashboard%2Fworkspaces&locale=ko");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
}
const lifecycle = (id: string) => `${api}/v2/workspaces/${id}/b2b/lifecycle`;

test("S26/S32 exact boundaries, permission-dependent recovery detail, deletion states, delayed and lost responses, team/account switch, 390px", async ({ page, request, browser }, info) => {
  // Team creation is limited to three per account, so two owners.
  const owner = await account(request, "f1-owner");
  const second = await account(request, "f1-owner2");
  const member = await account(request, "f1-member");
  const readOnly = await team(request, owner.headers, -1 * DAY);
  const recovery = await team(request, owner.headers, -31 * DAY);
  const ops = await team(request, owner.headers, -61 * DAY);
  const deleting = await team(request, second.headers, -61 * DAY);
  const deleted = await team(request, second.headers, -62 * DAY);
  const preparing = await team(request, second.headers, -61 * DAY);
  fixture({ workspaceId: ops, action: "ops_check" });
  fixture({ workspaceId: preparing, action: "settings_missing" });
  fixture({ workspaceId: ops, action: "join", userId: member.id });
  fixture({ workspaceId: deleting, action: "deleting" });
  fixture({ workspaceId: deleted, action: "deleted" });
  fixture({ workspaceId: recovery, action: "join", userId: member.id });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page, owner.email);

  // read_only: exact E/E+30/E+60 from the server, open/download only.
  const view = (await (await request.get(lifecycle(readOnly), { headers: owner.headers })).json()).data;
  await page.goto(`/dashboard/workspaces/${readOnly}/status`);
  const panel = page.getByTestId("team-lifecycle");
  await expect(panel).toContainText("이용 종료 시각 (E)");
  await expect(panel).toContainText("KST");
  const kst = (iso: string) =>
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  for (const iso of [view.boundaries.readOnlyFrom, view.boundaries.recoveryFrom, view.boundaries.deletionFrom])
    await expect(panel).toContainText(kst(iso));
  await expect(panel.getByText("편집·업로드·새 AI·코멘트")).toBeVisible();
  await expect(panel).toContainText("삭제가 시작되지 않았습니다.");
  await page.screenshot({ path: info.outputPath("s26-read-only.png"), fullPage: true });
  // read_only still lists projects (reading is allowed); no S32 notice.
  await page.goto(`/dashboard/workspaces/${readOnly}/projects`);
  await expect(page.getByTestId("team-access-notice")).toHaveCount(0);

  // recovery: billing owner sees recovery detail and the restore entry.
  await page.goto(`/dashboard/workspaces/${recovery}/status`);
  await expect(page.getByTestId("recovery-detail")).toContainText("진행 중인 복구 결제가 없습니다.");
  await expect(page.getByRole("link", { name: "이용 복구", exact: true })).toBeVisible();
  const recoveryView = (await (await request.get(lifecycle(recovery), { headers: owner.headers })).json()).data;
  await page.goto(`/dashboard/workspaces/${recovery}/projects`);
  await expect(page.getByTestId("team-access-notice")).toContainText("복구 보관 중이라 자료를 열 수 없습니다");
  // S32 gives the exact next boundary and no project or file names.
  await expect(page.getByTestId("team-access-notice")).toContainText(kst(recoveryView.boundaries.deletionFrom));
  // A participant without billing permission sees no billing detail.
  const memberContext = await browser.newContext({ locale: "ko-KR" });
  const memberPage = await memberContext.newPage();
  await signIn(memberPage, member.email);
  await memberPage.goto(`/dashboard/workspaces/${recovery}/status`);
  await expect(memberPage.getByTestId("team-lifecycle")).toBeVisible();
  await expect(memberPage.getByTestId("recovery-detail")).toHaveCount(0);
  await expect(memberPage.getByRole("link", { name: "이용 복구", exact: true })).toHaveCount(0);
  await expect(memberPage.getByText("이용 복구 구매")).toHaveCount(0);
  // The same member sees only a generic "checks before deletion" for the
  // team that is stopped on a payment check: no payment word, no billing block.
  await memberPage.goto(`/dashboard/workspaces/${ops}/status`);
  await expect(memberPage.getByTestId("deletion-state")).toContainText("삭제 시작 전 확인 중입니다. 시작 시각은 아직 확정되지 않았습니다.");
  await expect(memberPage.getByTestId("team-lifecycle")).not.toContainText(/결제 확인|운영 보류|payment/i);
  await expect(memberPage.getByTestId("recovery-detail")).toHaveCount(0);
  await memberPage.screenshot({ path: info.outputPath("s26-ops-check-member.png"), fullPage: true });
  await memberContext.close();

  // deletion_due + ops check, deleting, deleted.
  await page.goto(`/dashboard/workspaces/${ops}/projects`);
  await expect(page.getByTestId("team-access-notice")).toContainText("삭제 예정 시각이 지나 자료를 열 수 없습니다");
  await page.goto(`/dashboard/workspaces/${ops}/status`);
  await expect(page.getByTestId("deletion-state")).toContainText("결제 확인이 필요해 삭제를 멈췄습니다");
  await expect(page.getByTestId("recovery-detail")).toContainText("확인 기한");
  await expect(page.getByRole("link", { name: "이용 복구", exact: true })).toHaveCount(0);
  const secondContext = await browser.newContext({ locale: "ko-KR" });
  const secondPage = await secondContext.newPage();
  secondPage.on("pageerror", (e) => errors.push(e.message));
  await signIn(secondPage, second.email);
  // Missing deletion settings: even the billing owner gets no firm start time.
  await secondPage.goto(`/dashboard/workspaces/${preparing}/status`);
  await expect(secondPage.getByTestId("deletion-state")).toContainText("시작 시각은 아직 확정되지 않았습니다");
  await expect(secondPage.getByTestId("team-lifecycle")).toContainText("시작 시각 미확정");
  await secondPage.screenshot({ path: info.outputPath("s26-settings-missing.png"), fullPage: true });
  await secondPage.goto(`/dashboard/workspaces/${deleting}/status`);
  await expect(secondPage.getByTestId("deletion-state")).toContainText("복구할 수 없습니다");
  await expect(secondPage.getByRole("link", { name: "이용 복구", exact: true })).toHaveCount(0);
  await secondPage.goto(`/dashboard/workspaces/${deleted}/status`);
  await expect(secondPage.getByTestId("deletion-state")).toContainText("삭제가 완료되었습니다");
  await expect(secondPage.getByTestId("team-lifecycle")).toContainText("백업 사본 제거 기한");
  await expect(secondPage.getByTestId("recovery-detail")).toHaveCount(0);
  await secondPage.screenshot({ path: info.outputPath("s26-deleted.png"), fullPage: true });
  await secondPage.goto(`/dashboard/workspaces/${deleted}/projects`);
  await expect(secondPage.getByTestId("team-access-notice")).toContainText("팀 자료가 삭제되어 열 수 없습니다");
  await secondContext.close();

  // Lost response: an error with retry, never "deleted" or empty.
  let drop = true;
  await page.route(lifecycle(readOnly), async (route) => {
    if (drop) {
      drop = false;
      await route.abort();
    } else await route.continue();
  });
  await page.goto(`/dashboard/workspaces/${readOnly}/status`);
  await expect(page.locator("main [role=alert]").first()).toBeVisible();
  await expect(page.getByTestId("team-lifecycle")).toHaveCount(0);
  await expect(page.getByText("삭제 완료")).toHaveCount(0);
  await page.getByRole("button", { name: "다시 확인", exact: true }).first().click();
  await expect(page.getByTestId("team-lifecycle")).toContainText("삭제가 시작되지 않았습니다.");
  await page.unroute(lifecycle(readOnly));

  // Delayed response for team A must not paint on team B after a switch.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(lifecycle(ops), async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/dashboard/workspaces/${ops}/status`);
  await expect(page.getByText("현재 이용 상태를 확인하는 중입니다.")).toBeVisible();
  await page.goto(`/dashboard/workspaces/${readOnly}/status`);
  release();
  await expect(page.getByTestId("deletion-state")).toContainText("삭제가 시작되지 않았습니다.");
  await page.waitForTimeout(1500);
  await expect(page.getByText("결제 확인이 필요해 삭제를 멈췄습니다")).toHaveCount(0);
  await page.unroute(lifecycle(ops));

  // Refresh keeps the server state.
  await page.reload();
  await expect(page.getByTestId("deletion-state")).toContainText("삭제가 시작되지 않았습니다.");

  // 390px: no horizontal page scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/workspaces/${ops}/status`);
  await expect(page.getByTestId("recovery-detail")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("s26-ops-check-390.png"), fullPage: true });
  await page.goto(`/dashboard/workspaces/${recovery}/projects`);
  await expect(page.getByTestId("team-access-notice")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath("s32-recovery-390.png"), fullPage: true });

  // Account switch in the same browser: the old team's view is not shown.
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, member.email);
  await page.goto(`/dashboard/workspaces/${ops}/status`);
  await expect(page.getByTestId("team-lifecycle")).toHaveCount(0);
  await expect(page.getByText("결제 확인이 필요해 삭제를 멈췄습니다")).toHaveCount(0);
  expect(errors).toEqual([]);
});
