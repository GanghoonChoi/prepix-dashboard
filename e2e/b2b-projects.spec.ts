import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function fixture(input: object) {
  execFileSync(
    process.execPath,
    [
      resolve("../prepix-backend/backend/scripts/b2b-test-fixture.cjs"),
      JSON.stringify(input),
    ],
    { timeout: 15_000 },
  );
}
async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${suffix()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: label },
      })
    ).status(),
  ).toBe(201);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email, password },
      })
    ).json()
  ).data;
  return {
    email,
    id: session.user.id as string,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  };
}
async function signIn(page: Page, email: string) {
  await page.goto("/login?returnTo=%2Fdashboard%2Fworkspaces&locale=ko");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
}
test("B2B preparing gate, private projects, lost-response retry, role handoff and immediate revocation", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const owner = await account(request, "b2b-owner");
  const editor = await account(request, "b2b-editor");
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name: `B2B ${suffix()}` },
  });
  expect(created.status()).toBe(201);
  const team = (await created.json()).data.workspace;
  const base = `/dashboard/workspaces/${team.id}`;
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team.id}/b2b/enroll`, {
        headers: owner.headers,
        data: {
          revision: 0,
          requestKey: crypto.randomUUID(),
          reason: "Local B2B acceptance fixture",
        },
      })
    ).status(),
  ).toBe(201);
  await signIn(page, owner.email);
  await page.goto(base);
  await expect(
    page.getByText("첫 이용권 반영 전에는 이용기간이 시작되지 않습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "프로젝트", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${base}/projects/new`);
  await expect(page.locator("main [role=alert]")).toBeVisible();
  fixture({ workspaceId: team.id, action: "activate" });
  fixture({ workspaceId: team.id, action: "join", userId: editor.id });
  const editorContext = await browser.newContext({ locale: "ko-KR" });
  const editorPage = await editorContext.newPage();
  const browserErrors: string[] = [];
  editorPage.on("pageerror", (e) => browserErrors.push(e.message));
  try {
    await signIn(editorPage, editor.email);
    await editorPage.goto(`${base}/projects/new`);
    await editorPage
      .getByLabel("프로젝트명", { exact: true })
      .fill("Private B2B project");
    await editorPage
      .getByLabel("작업 개요", { exact: true })
      .fill("Only invited people may see this brief");
    await editorPage
      .getByLabel("납품에 편집 가능한 작업 파일과 소스 확인 필요")
      .check();
    const endpoint = `${api}/v2/workspaces/${team.id}/b2b/projects`;
    let lost = true;
    await editorPage.route(endpoint, async (route) => {
      if (route.request().method() === "POST" && lost) {
        lost = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await editorPage
      .getByRole("button", { name: "프로젝트 만들기", exact: true })
      .click();
    await expect(editorPage.locator("main [role=alert]")).toContainText(
      "요청을 완료하지 못했습니다",
    );
    await expect(
      editorPage.getByLabel("프로젝트명", { exact: true }),
    ).toHaveValue("Private B2B project");
    await editorPage
      .getByRole("button", { name: "프로젝트 만들기", exact: true })
      .click();
    await expect(
      editorPage.getByRole("heading", {
        name: "Private B2B project",
        exact: true,
      }),
    ).toBeVisible();
    const projectId = editorPage.url().split("/").at(-1)!;
    const list = (
      await (await request.get(endpoint, { headers: editor.headers })).json()
    ).data;
    expect(list.projects).toHaveLength(1);
    await page.goto(`${base}/projects`);
    await expect(
      page.getByText("참여한 프로젝트가 없습니다.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Private B2B project", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base}/projects/${projectId}`);
    await expect(page.locator("main [role=alert]")).toContainText(
      "접근 권한이 없습니다",
    );
    await editorPage.getByRole("link", { name: "참여자", exact: true }).click();
    await editorPage
      .getByLabel("팀 참여자", { exact: true })
      .selectOption(owner.id);
    await editorPage
      .getByLabel("변경·종료·이전 사유")
      .fill("Invite the owner into this specific project");
    await editorPage
      .getByRole("button", { name: "참여 범위 저장", exact: true })
      .click();
    await expect(
      editorPage.locator("main").getByText(owner.email, { exact: true }),
    ).toBeVisible();
    await editorPage
      .getByRole("button", { name: "담당자 이전", exact: true })
      .click();
    await expect(
      editorPage.getByRole("button", { name: "참여 범위 저장", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Private B2B project", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "개요 수정", exact: true }).click();
    await page
      .getByLabel("작업 개요", { exact: true })
      .fill("Changed after handoff");
    await page.getByRole("button", { name: "변경 저장", exact: true }).click();
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("project-overview.png"),
      fullPage: true,
    });
    fixture({ workspaceId: team.id, action: "remove", userId: editor.id });
    await editorPage.reload();
    await expect(editorPage.locator("main [role=alert]")).toBeVisible();
    await expect(
      editorPage.getByText("Private B2B project", { exact: true }),
    ).toHaveCount(0);
    fixture({ workspaceId: team.id, action: "expire" });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "개요 수정", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toBeVisible();
    fixture({ workspaceId: team.id, action: "recover" });
    await page.reload();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally {
    await editorContext.close();
  }
});
