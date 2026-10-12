import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, account, fixture, open, upload, videoReady, json } from "./b2b-review-helpers";

// 2026-10-12, the review screen like Frame.io / Dropbox Replay: one
// window-tall workspace, comments as 요청 / 해결됨, the comment's time follows
// the playhead while it is being written, a memo per version, and 승인 as the
// one status button (수정 요청 is what comments are).
test("review workspace: playhead-following comments, 요청/해결됨, version memo, approve and withdraw", async ({ browser, request }) => {
  test.setTimeout(360_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, member] = await Promise.all(["rl-owner", "rl-lead", "rl-member"].map((l) => account(request, l)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "리뷰 화면 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  for (const user of [lead, member]) fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: user.id });
  const projectId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: "브랜드 필름" } }))).project.id as string;
  const base = `/dashboard/workspaces/${team}/projects/${projectId}`, root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`;

  // The lead stores a result and registers it; it is published to review.
  const L = await open(browser, lead, `${base}/files`);
  await L.page.waitForURL((u) => u.pathname === `${base}/files`);
  // Stored the way the app's publish does (the web has no upload).
  const uploadId = await upload(request, lead, team, projectId, "cut-v1.mp4", { kind: "output" });
  await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: lead.headers }))).versions.length, { timeout: 90_000 }).toBe(1);
  const version = (await json(request.get(`${root}/files`, { headers: lead.headers }))).versions[0];
  const list = await json(request.get(`${root}/publications`, { headers: lead.headers }));
  const registered = await request.post(`${root}/publications`, { headers: lead.headers, data: {
    requestKey: randomUUID(), participationId: list.currentParticipationId, originWorkId: "local-work", originResultId: "render-one", originRequestId: null,
    basisRevision: list.projectRevision, uploadId, title: "메인 컷", generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size,
  } });
  expect(registered.status(), await registered.text()).toBe(201);
  await expect.poll(async () => (await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews.length, { timeout: 120_000 }).toBe(1);
  const reviewId = (await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews[0].id as string;
  const review = `${root}/reviews/${reviewId}`;
  await expect.poll(async () => (await json(request.get(review, { headers: lead.headers }))).preview.state, { timeout: 120_000 }).toBe("ready");
  const detail = await json(request.get(review, { headers: lead.headers }));
  // Enough feedback to need scrolling, one of it long.
  for (let i = 0; i < 14; i++)
    expect((await request.post(`${review}/comments`, { headers: lead.headers, data: {
      requestKey: randomUUID(), round: detail.review.round, versionId: detail.review.versionId, startMs: i * 400, endMs: null,
      body: i === 2 ? "컬러가 전체적으로 차갑습니다. ".repeat(12) : `의견 ${i + 1}`,
    } })).status()).toBe(201);

  const url = `${base}/reviews/${reviewId}`;
  await L.page.setViewportSize({ width: 1440, height: 900 });
  await L.page.goto(url);
  await videoReady(L.page);
  // One window: the page itself does not scroll; the comment list does.
  await expect.poll(() => L.page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
  const scroller = L.page.getByRole("region", { name: "코멘트", exact: true }).getByRole("list").first().locator("..");
  expect(await scroller.evaluate((n) => n.scrollHeight > n.clientHeight)).toBe(true);
  // A long comment folds.
  await expect(L.page.getByRole("button", { name: "더 보기", exact: true })).toHaveCount(1);
  await expect(L.page.getByRole("button", { name: /수정 요청/ })).toHaveCount(0);

  // The time follows the playhead while typing, until a range is set.
  const seekTo = async (s: number) => {
    await L.page.locator("video").evaluate((v: HTMLVideoElement, t) => { v.currentTime = t; }, s);
    await expect.poll(() => L.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(s - 0.1);
  };
  await seekTo(1.2);
  const box = L.page.getByRole("textbox", { name: "코멘트 내용", exact: true });
  await box.fill("스크럽한 위치의 의견");
  await seekTo(3.6);
  await L.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(L.page.getByRole("listitem").getByText("스크럽한 위치의 의견", { exact: true })).toBeVisible();
  const posted = (await json(request.get(review, { headers: lead.headers }))).comments.find((m: { body: string }) => m.body === "스크럽한 위치의 의견");
  expect(posted.startMs).toBeGreaterThanOrEqual(3500);

  // 요청 → 해결됨 and back.
  const filter = L.page.getByRole("group", { name: "코멘트 보기", exact: true });
  await expect(filter.getByRole("button", { name: "요청 15", exact: true })).toHaveAttribute("aria-pressed", "true");
  const item = L.page.getByRole("listitem").filter({ hasText: "스크럽한 위치의 의견" });
  await item.getByRole("button", { name: "해결로 표시", exact: true }).click();
  await expect(filter.getByRole("button", { name: "해결됨 1", exact: true })).toBeVisible();
  await expect(L.page.getByText("스크럽한 위치의 의견", { exact: true })).toHaveCount(0);
  await filter.getByRole("button", { name: "해결됨 1", exact: true }).click();
  await expect(item).toContainText("님이 해결함");
  await item.getByRole("button", { name: "요청으로 되돌리기", exact: true }).click();
  await expect(filter.getByRole("button", { name: "요청 15", exact: true })).toBeVisible();

  // A memo on the version, above its comments.
  await L.page.getByRole("button", { name: "V1에 메모 남기기", exact: true }).click();
  await L.page.getByRole("textbox", { name: "V1 메모", exact: true }).fill("컬러 1차 보정 반영");
  await L.page.getByRole("button", { name: "메모 저장", exact: true }).click();
  await expect(L.page.getByRole("region", { name: "V1 메모", exact: true })).toContainText("컬러 1차 보정 반영");

  // 승인 and withdrawing it.
  await L.page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(L.page.getByText("승인됨", { exact: true })).toBeVisible();
  await expect.poll(async () => (await json(request.get(review, { headers: lead.headers }))).approval).toBe("approved");
  await L.page.getByRole("button", { name: "더보기", exact: true }).click();
  await L.page.getByRole("menuitem", { name: "승인 취소", exact: true }).click();
  await expect(L.page.getByRole("button", { name: "승인", exact: true })).toBeVisible();
  await expect(L.page.getByText("승인됨", { exact: true })).toHaveCount(0);

  // A teammate reads the memo but does not write it.
  const M = await open(browser, member, url);
  await videoReady(M.page);
  await expect(M.page.getByRole("region", { name: "V1 메모", exact: true })).toContainText("컬러 1차 보정 반영");
  await expect(M.page.getByRole("button", { name: "메모 수정", exact: true })).toHaveCount(0);
  expect((await json(request.get(review, { headers: member.headers }))).allowedActions.editNote).toBe(false);
  expect((await request.post(`${review}/versions/${detail.review.versionId}/note`, { headers: member.headers, data: { requestKey: randomUUID(), note: "남의 메모" } })).status()).toBe(403);

  for (const view of [L, M]) expect(view.errors).toEqual([]);
  await Promise.all([L, M].map((v) => v.close()));
});
