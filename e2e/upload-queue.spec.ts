import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";

/**
 * The transfer queue, at the surface the unit tests cannot reach.
 *
 * Needs the preview harness started with TEAM_TEST_STORAGE=true (MinIO on
 * 127.0.0.1:3900); it skips rather than fails where team storage is off.
 */
test("a rejected file does not cancel the batch and the rest still upload", async ({
  page,
  request,
}) => {
  const email = `up-${Date.now()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "uploader" },
      })
    ).status()
  ).toBe(201);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email, password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const cloud = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities/cloud`, { headers })
    ).json()
  ).data;
  test.skip(
    !cloud?.enabled || !cloud?.uploadsEnabled,
    "team storage is not enabled in this environment"
  );
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "Upload queue" },
      })
    ).json()
  ).data.workspace;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/dashboard/workspaces/${workspace.id}/projects?locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();

  await page.getByLabel("새 프로젝트", { exact: true }).fill("Queue test");
  await page.getByRole("button", { name: "프로젝트 만들기", exact: true }).click();
  await page.getByRole("link", { name: /Queue test/ }).click();
  await expect(
    page.getByRole("heading", { name: "Queue test", level: 1 })
  ).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles([
    { name: "a.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(2048, 7) },
    { name: "sidecar.xml", mimeType: "text/xml", buffer: Buffer.alloc(0) },
    { name: "b.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(1024, 9) },
  ]);

  const panel = page.getByRole("region", { name: "전송 패널" });
  await expect(panel.getByRole("listitem")).toHaveCount(3);
  // The 0-byte file is marked in place, not a verdict on the selection.
  await expect(
    panel.getByRole("listitem").filter({ hasText: "sidecar.xml" })
  ).toContainText("업로드할 수 없음");
  // Everything after it still went.
  for (const name of ["a.mov", "b.mov"])
    await expect(
      panel.getByRole("listitem").filter({ hasText: name })
    ).toContainText("전송 완료", { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "a.mov" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "b.mov" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "sidecar.xml" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

/**
 * F03.1 visibility. Creating WITH a choice is open to editors; CHANGING it is
 * owner/admin only, because it is an ACL change. This covers the owner path and
 * the copy; the editor-refusal half is pinned by the backend's own integration
 * test ("team visibility opens the door to every member without widening what
 * is behind it").
 */
test("a project carries the visibility it was created with, and only an admin can change it", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const email = `vis-${suffix}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "vis" },
      })
    ).status()
  ).toBe(201);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email, password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const cloud = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities/cloud`, { headers })
    ).json()
  ).data;
  test.skip(
    !cloud?.enabled,
    "team storage is not enabled in this environment"
  );
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: `Visibility ${suffix}` },
      })
    ).json()
  ).data.workspace;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/dashboard/workspaces/${workspace.id}/projects?locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();

  // The default is 지정 멤버만, as F03.1 recommends.
  const choice = page.getByLabel("공개 범위", { exact: true });
  await expect(choice).toHaveValue("restricted");
  await page.getByLabel("새 프로젝트", { exact: true }).fill("Locked down");
  await page.getByRole("button", { name: "프로젝트 만들기", exact: true }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Locked down" })
  ).toContainText("지정 멤버만 접근");

  // Creating with the other choice is respected, not silently defaulted.
  await page.getByLabel("새 프로젝트", { exact: true }).fill("Open to all");
  await choice.selectOption("team");
  // Opening the door must not claim it widens what is behind it.
  await expect(
    page.getByText(/업로드와 원본 다운로드 권한은 멤버별로 따로 정합니다/)
  ).toBeVisible();
  await page.getByRole("button", { name: "프로젝트 만들기", exact: true }).click();
  const openRow = page.getByRole("listitem").filter({ hasText: "Open to all" });
  await expect(openRow).toContainText("팀 전체 보기 가능");

  // The detail screen states it too, and an owner can narrow it.
  await openRow.getByRole("link").click();
  await expect(
    page.getByText(/팀 전체가 이 프로젝트를 볼 수 있습니다/)
  ).toBeVisible();
  await page.getByRole("button", { name: "프로젝트 접근 관리" }).click();
  const control = page.getByLabel("공개 범위", { exact: true });
  await expect(control).toHaveValue("team");
  await control.selectOption("restricted");
  await expect(
    page.getByText(/지정 멤버만 이 프로젝트를 볼 수 있습니다/)
  ).toBeVisible();
  expect(errors).toEqual([]);
});
