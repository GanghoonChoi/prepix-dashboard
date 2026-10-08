import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, account, allMail, fixture, open, json } from "./b2b-review-helpers";

// 뷰어 (2026-10-08): like a Figma viewer — free, no team dashboard, only the
// projects shared with them, to watch and comment.
test("the owner invites a viewer from the members page; the viewer gets projects only", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const [owner, viewer] = await Promise.all(["vw-owner", "vw-viewer"].map((l) => account(request, l)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "뷰어 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  const project = "팀 브랜드 필름";
  await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: owner.headers, data: { requestKey: randomUUID(), name: project, visibility: "team" } });
  const home = `/dashboard/workspaces/${team}`;

  // From the default 멤버 tab: the invite dialog opens (it used to open inside
  // the hidden 초대 panel) and offers the viewer role, which takes no seat.
  const O = await open(browser, owner, `${home}/members`);
  await O.page.waitForURL((u) => u.pathname === `${home}/members`);
  await O.page.getByRole("button", { name: "초대", exact: true }).click();
  const form = O.page.getByRole("dialog");
  await form.getByLabel("초대 이메일", { exact: true }).fill(viewer.email);
  await form.getByLabel("초대 역할", { exact: true }).selectOption("reviewer");
  await expect(form.getByText("수락하면 편집 좌석 배정", { exact: true })).toHaveCount(0);
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
  await V.page.goto(`${home}/projects/new`);
  await expect(V.page.getByTestId("access-denied")).toContainText("뷰어는 공유받은 프로젝트를 보고 코멘트만 할 수 있습니다");
  for (const path of ["settings", "plan"]) {
    await V.page.goto(`${home}/${path}`);
    await expect(V.page.getByTestId("access-denied")).toContainText("권한이 없습니다");
  }
  expect((await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: viewer.headers, data: { requestKey: randomUUID(), name: "뷰어가 만든 프로젝트" } })).status()).toBe(403);
  await Promise.all([O, V].map((v) => v.close()));
});
