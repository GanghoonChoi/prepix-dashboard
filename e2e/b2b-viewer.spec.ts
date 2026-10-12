import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, account, allMail, fixture, open, json } from "./b2b-review-helpers";

// 뷰어 (2026-10-08): like a Figma viewer — free, no team dashboard, only the
// projects shared with them, to watch and comment.
test("the owner invites a viewer from the members page; the viewer gets projects only", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const [owner, viewer, editor] = await Promise.all(["vw-owner", "vw-viewer", "vw-editor"].map((l) => account(request, l)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "뷰어 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  const project = "팀 브랜드 필름";
  await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: owner.headers, data: { requestKey: randomUUID(), name: project, visibility: "team" } });
  const home = `/dashboard/workspaces/${team}`;

  // From the default 멤버 tab: the invite dialog opens (it used to open inside
  // the hidden 초대 panel) and offers the viewer role, which takes no seat.
  const O = await open(browser, owner, `${home}/members`);
  await O.page.waitForURL((u) => u.pathname === `${home}/members`);
  // What each role can do and which menus it gets: behind the "?" beside 역할,
  // not under the list (2026-10-12).
  await expect(O.page.locator("[data-role-guide]")).toHaveCount(4);
  await expect(O.page.locator("[data-role-guide]").first()).toBeHidden();
  await O.page.getByRole("button", { name: "역할별 권한", exact: true }).click();
  const guide = O.page.getByRole("dialog", { name: "역할별 권한" });
  await expect(guide.locator('[data-role-guide="editor"]')).toContainText("메뉴: 홈 · 프로젝트");
  await expect(guide.locator('[data-role-guide="reviewer"]')).toContainText("메뉴: 프로젝트 (공유받은 것만)");
  await O.page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await O.page.getByRole("button", { name: "초대", exact: true }).click();
  const form = O.page.getByRole("dialog");
  await form.getByLabel("초대 이메일", { exact: true }).fill(viewer.email);
  await form.getByLabel("초대 역할", { exact: true }).selectOption("reviewer");
  await expect(form.getByTestId("invite-seat-info")).toContainText("좌석이 필요 없어 무료");
  const known = new Set((await allMail(request)).map((m: { inviteUrl?: string }) => m.inviteUrl));
  await form.getByRole("button", { name: "초대 보내기", exact: true }).click();
  let inviteUrl = "";
  await expect
    .poll(async () => {
      inviteUrl = (await allMail(request)).findLast((m: { to: string; inviteUrl?: string }) => m.to === viewer.email && !known.has(m.inviteUrl))?.inviteUrl ?? "";
      return inviteUrl;
    }, { timeout: 30_000 })
    .toBeTruthy();
  const token = new URL(inviteUrl).pathname.split("/").at(-1);
  expect((await request.post(`${api}/v2/b2b/invitations/${token}/accept`, { headers: viewer.headers })).status()).toBe(201);

  // The viewer: no team home, one nav entry, the shared project, no create.
  const V = await open(browser, viewer, home);
  await V.page.waitForURL((u) => u.pathname === `${home}/projects`);
  await expect(V.page.getByRole("row", { name: new RegExp(project) })).toContainText("뷰어", { timeout: 30_000 });
  const nav = V.page.getByRole("navigation").first();
  await expect(nav.getByRole("link", { name: "프로젝트", exact: true })).toBeVisible();
  for (const name of ["홈", "멤버", "플랜과 결제", "설정"]) await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(V.page.getByRole("link", { name: "프로젝트 만들기", exact: true })).toHaveCount(0);
  for (const path of ["settings", "plan", "members", "media", "status"]) {
    await V.page.goto(`${home}/${path}`);
    await expect(V.page.getByTestId("access-denied")).toContainText("권한이 없습니다");
  }
  expect((await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: viewer.headers, data: { requestKey: randomUUID(), name: "뷰어가 만든 프로젝트" } })).status()).toBe(403);

  // The editor: home and projects; the team's management pages refuse them.
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: editor.id });
  const E = await open(browser, editor, home);
  await E.page.waitForURL((u) => u.pathname === home);
  const editorNav = E.page.getByRole("navigation", { name: "워크스페이스 메뉴" });
  for (const name of ["홈", "프로젝트"]) await expect(editorNav.getByRole("link", { name, exact: true })).toBeVisible();
  for (const name of ["멤버", "플랜과 결제", "설정"]) await expect(editorNav.getByRole("link", { name, exact: true })).toHaveCount(0);
  for (const path of ["settings", "plan", "members"]) {
    await E.page.goto(`${home}/${path}`);
    await expect(E.page.getByTestId("access-denied")).toContainText("권한이 없습니다");
  }
  await Promise.all([O, V, E].map((v) => v.close()));
});
