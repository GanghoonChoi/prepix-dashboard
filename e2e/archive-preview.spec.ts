import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";

/**
 * Watching an original in the browser, and what happens when you cannot.
 *
 * There is no proxy pipeline on the server, so the player streams the ORIGINAL
 * through a signed URL that lives 60 seconds. Two outcomes are normal and both
 * are covered here: a file the browser can decode plays, and one it cannot
 * says so and offers the download instead of failing silently.
 *
 * The grid assertion at the end is the poster cache: a tile fills in because
 * the clip was watched on this machine, never because anything was fetched to
 * make a thumbnail.
 *
 * Needs the preview harness started with TEAM_TEST_STORAGE=true (MinIO on
 * 127.0.0.1:3900); it skips rather than fails where team storage is off.
 */
test("a playable original opens in the player, an undecodable one says so", async ({
  page,
  request,
}) => {
  const email = `preview-${Date.now()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "previewer" },
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
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const cloud = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities/cloud`, { headers })
    ).json()
  ).data;
  test.skip(
    !cloud?.enabled || !cloud?.uploadsEnabled,
    "team storage is not enabled in this environment",
  );
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "Archive preview" },
      })
    ).json()
  ).data.workspace;

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/dashboard/workspaces/${workspace.id}/media?locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "팀 아카이브", level: 1 }),
  ).toBeVisible();

  // One real H.264 file and one that only claims to be video. The second is
  // what an editing original looks like to a browser: bytes it will not decode.
  // Playwright will not mix a path with a buffer in one call, so the real file
  // is read off disk and both go in as buffers.
  await page.locator('input[type="file"]').setInputFiles([
    {
      name: "playable.mp4",
      mimeType: "video/mp4",
      buffer: readFileSync("e2e/fixtures/playable.mp4"),
    },
    {
      name: "undecodable.mov",
      mimeType: "video/quicktime",
      buffer: Buffer.alloc(4096, 3),
    },
  ]);
  const panel = page.getByRole("region", { name: "전송 패널" });
  for (const name of ["playable.mp4", "undecodable.mov"])
    await expect(
      panel.getByRole("listitem").filter({ hasText: name }),
    ).toContainText("전송 완료", { timeout: 30_000 });

  // Verification has to finish before the bytes are released for download, and
  // a player opened before that would ask for a URL the server refuses.
  const playableRow = page.getByRole("row").filter({ hasText: "playable.mp4" });
  await expect(playableRow).toContainText("보관됨", { timeout: 30_000 });

  // Order by name so the walk below is deterministic — newest-first would put
  // whichever file finished verifying last at the top. Sorting is the other
  // half of what a list view is for, so this is worth asserting too.
  await page.getByRole("button", { name: "이름" }).click();
  await expect(
    page.getByRole("columnheader", { name: "이름" }),
  ).toHaveAttribute("aria-sort", "ascending");
  const names = await page
    .getByRole("row")
    .filter({ hasText: ".m" })
    .allInnerTexts();
  expect(names[0]).toContain("playable.mp4");

  // ---- the file the browser can decode ---------------------------------
  await playableRow.getByRole("button", { name: "playable.mp4" }).click();
  const player = page.getByRole("dialog");
  await expect(player).toBeVisible();
  const video = player.locator("video");
  await expect(video).toBeVisible();
  // Actually decoding, not merely present: HAVE_CURRENT_DATA or better means
  // the browser pulled the bytes through the signed URL and produced a frame.
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.readyState), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(2);

  // ---- and the one it cannot -------------------------------------------
  await player.getByRole("button", { name: "다음 파일" }).click();
  await expect(player).toContainText("재생할 수 없습니다", { timeout: 20_000 });
  await expect(
    player.getByRole("button", { name: "원본 다운로드" }),
  ).toBeVisible();
  // Closed by something a person can SEE. Escape and a backdrop click both
  // worked before this button existed, and neither is visible — the player
  // fills its panel, so on a small window there is barely any backdrop left to
  // click either. It looked like a video you could not get out of.
  await player.getByRole("button", { name: "닫기" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // ---- the poster the viewer paid for by watching ----------------------
  // Nothing was fetched to build this. The frame came off the clip that was
  // just played, so exactly one tile has one and the other does not.
  await page.getByRole("radio", { name: "그리드" }).click();
  const watched = page.getByRole("figure").filter({ hasText: "playable.mp4" });
  await expect(watched.locator("img")).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("figure").filter({ hasText: "undecodable.mov" }).locator("img"),
  ).toHaveCount(0);

  expect(errors).toEqual([]);
});
