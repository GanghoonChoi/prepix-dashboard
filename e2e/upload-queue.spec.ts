import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";

/**
 * The transfer queue, at the surface the unit tests cannot reach.
 *
 * D14 removes the cloud "team project" — a workspace is one team video
 * archive, and assets and folders belong to it directly, so this now goes
 * straight to the workspace's archive at `/media` instead of creating a
 * project first.
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
  await page.goto(`/dashboard/workspaces/${workspace.id}/media?locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();

  // The archive is the workspace's whole surface now — no project to create
  // or open first.
  await expect(
    page.getByRole("heading", { name: "팀 아카이브", level: 1 })
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
  // They landed in the archive itself, not just in the transfer panel. Rows in
  // a table, not headings: fifty files used to emit fifty <h3>s into the
  // document outline, one per file name.
  const rows = page.getByRole("row");
  await expect(rows.filter({ hasText: "a.mov" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "b.mov" })).toHaveCount(1);
  // The 0-byte file was refused before it ever reached the server.
  await expect(rows.filter({ hasText: "sidecar.xml" })).toHaveCount(0);

  // The same archive, the other way round. The view choice is the viewer's, so
  // it has to survive a reload.
  await page.getByRole("radio", { name: "그리드" }).click();
  await expect(page.getByRole("figure").filter({ hasText: "a.mov" })).toHaveCount(
    1,
  );
  await page.reload();
  await expect(page.getByRole("radio", { name: "그리드" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "리스트" }).click();
  expect(errors).toEqual([]);
});

// D14 removes the cloud "team project" and, with it, per-project visibility
// and the separate original-download grant §3.2 used to require of editors —
// there is no longer a project-level ACL to create with a visibility choice
// or narrow from an admin panel. The archive's permission verdicts
// (`canEdit`/`canDownload`/`canPurge`/`canManage`) come from the workspace
// role alone; the backend's own integration test covers that a reviewer
// cannot reach the archive at all.
