import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, account, fixture, invite, open, upload, json, shot } from "./b2b-review-helpers";

// SOT: prepix-backend backend/docs/b2b-team-visibility.md (2026-10-07 review
// fixes). Automatic publication opens a round to internal members only; an
// external client sees nothing until the lead opens a round to them, and then
// only that round — never the earlier round's internal comments.
test("V: an external client does not see an automatically published round until the lead opens one to them", async ({ browser, request }) => {
  test.setTimeout(600_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, producer, member, client] = await Promise.all(
    ["tvx-owner", "tvx-lead", "tvx-producer", "tvx-member", "tvx-client"].map((l) => account(request, l)),
  );
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "외부 공개 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  for (const user of [lead, producer, member]) fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: user.id });
  const home = `/dashboard/workspaces/${team}`;
  const projectId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: "고객 검토 영상", visibility: "team" } }))).project.id as string;
  await invite(request, lead, team, projectId, producer, "internal", "producer");
  await invite(request, lead, team, projectId, client, "external", "reviewer");
  const base = `${home}/projects/${projectId}`, root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`;

  // The producer stores and registers a result; it publishes by itself.
  const P = await open(browser, producer, `${base}/files`);
  await P.page.waitForURL((url) => url.pathname === `${base}/files`);
  let uploadId = "";
  P.page.on("response", async (response) => {
    if (response.url() === `${root}/uploads` && response.request().method() === "POST" && response.status() === 201)
      uploadId = (await response.json()).data.upload.id;
  });
  await P.page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("output");
  await upload(P.page, "cut-v1.mp4");
  await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions.length, { timeout: 90_000 }).toBe(1);
  await expect.poll(() => uploadId).toBeTruthy();
  const version = (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions[0];
  const list = await json(request.get(`${root}/publications`, { headers: producer.headers }));
  const registered = await request.post(`${root}/publications`, { headers: producer.headers, data: {
    requestKey: randomUUID(), participationId: list.currentParticipationId, originWorkId: "local-work", originResultId: "render-one", originRequestId: null,
    basisRevision: list.projectRevision, uploadId, title: "고객 전 내부 검토", generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size,
  } });
  expect(registered.status(), await registered.text()).toBe(201);
  await expect.poll(async () => (await json(request.get(`${root}/reviews`, { headers: member.headers }))).reviews.length, { timeout: 120_000 }).toBe(1);
  const reviewId = (await json(request.get(`${root}/reviews`, { headers: member.headers }))).reviews[0].id as string;
  const auto = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
  expect([auto.review.audienceScope, auto.review.round, auto.audience]).toEqual(["project", 1, []]);

  // An internal team member (not a participant) leaves an internal comment on the automatic round.
  const internal = "내부 의견: 고객에게 보내기 전 자막 확인";
  const commented = await request.post(`${root}/reviews/${reviewId}/comments`, { headers: member.headers, data: { requestKey: randomUUID(), round: 1, versionId: version.id, body: internal, startMs: 500, endMs: null } });
  expect(commented.status(), await commented.text()).toBe(201);

  // The client sees nothing: S34 list, S14 direct address, home feed, API.
  expect((await json(request.get(`${root}/reviews`, { headers: client.headers }))).reviews).toEqual([]);
  expect((await request.get(`${root}/reviews/${reviewId}`, { headers: client.headers })).status()).toBe(404);
  const C = await open(browser, client, `${base}/reviews`);
  await expect(C.page.getByText("아직 검토가 없습니다.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(C.page.locator("body")).not.toContainText("고객 전 내부 검토");
  await shot(C.page, "s34-client-before-opened");
  await C.page.goto(`${base}/reviews/${reviewId}`);
  await expect(C.page.getByText("검토를 찾을 수 없거나 볼 수 있는 범위가 아닙니다.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(C.page.locator("body")).not.toContainText(internal);
  await C.page.goto(home);
  await expect(C.page.getByRole("region", { name: "최근 발행", exact: true }).getByText("지금 볼 수 있는 발행 영상이 없습니다.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(C.page.locator("body")).not.toContainText("고객 전 내부 검토");

  // The lead opens a round to the client: the audience form starts from the
  // current (project) round, and the client is ticked as an external.
  const L = await open(browser, lead, `${base}/reviews/${reviewId}`);
  const audience = L.page.getByRole("heading", { name: "검토 대상 변경", exact: true }).locator("..");
  await expect(audience.getByRole("radio", { name: "폴더 내부 전체 공개", exact: true })).toBeChecked({ timeout: 30_000 });
  await expect(audience.getByText("외부 참여자에게도 이 회차 공개 (선택)", { exact: true })).toBeVisible();
  await audience.getByRole("checkbox", { name: "tvx-client · 검토자", exact: true }).check();
  await audience.getByLabel("대상 변경 사유(필수)", { exact: true }).fill("고객 검토 시작");
  await shot(L.page, "s14-lead-open-to-client");
  await audience.getByRole("button", { name: "대상을 확정하고 새 회차 공개", exact: true }).click();
  await expect(L.page.getByText(/V1 · 회차 2/)).toBeVisible({ timeout: 30_000 });
  const opened = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
  expect([opened.review.audienceScope, opened.review.round, opened.audience.map((p: { userId: string }) => p.userId)]).toEqual(["project", 2, [client.id]]);
  await expect(L.page.getByText("현재 검토 대상: 폴더 내부 전체 공개 · 외부 tvx-client", { exact: true })).toBeVisible();

  // The client now sees round 2 only; round 1 and its internal comment stay internal.
  const seen = await json(request.get(`${root}/reviews/${reviewId}`, { headers: client.headers }));
  expect([seen.review.round, seen.rounds.map((r: { round: number }) => r.round), seen.comments]).toEqual([2, [2], []]);
  expect((await request.get(`${root}/reviews/${reviewId}?round=1`, { headers: client.headers })).status()).toBe(404);
  expect((await json(request.get(`${root}/reviews`, { headers: client.headers }))).reviews.map((r: { id: string }) => r.id)).toEqual([reviewId]);
  await C.page.goto(`${base}/reviews`);
  await expect(C.page.getByRole("link", { name: /고객 전 내부 검토/ })).toBeVisible({ timeout: 30_000 });
  await C.page.getByRole("link", { name: /고객 전 내부 검토/ }).click();
  await expect(C.page.getByText(/V1 · 회차 2/)).toBeVisible({ timeout: 30_000 });
  await expect(C.page.getByRole("navigation", { name: "검토 회차", exact: true })).toHaveCount(0);
  await expect(C.page.locator("body")).not.toContainText(internal);
  await shot(C.page, "s14-client-opened-round");
  // Internal members keep both rounds.
  expect((await json(request.get(`${root}/reviews/${reviewId}?round=1`, { headers: member.headers }))).comments.map((c: { body: string }) => c.body)).toEqual([internal]);

  for (const view of [P, C, L]) expect(view.errors).toEqual([]);
  await Promise.all([P, C, L].map((v) => v.close()));
});

// Decision 2026-10-07: an external maker sees (and comments on) the round
// opened by their own publication; another external participant still sees
// nothing until the lead opens a round to them.
test("V: an external maker sees the round of their own publication; another client does not", async ({ browser, request }) => {
  test.setTimeout(600_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, vendor, client] = await Promise.all(["tve-owner", "tve-lead", "tve-vendor", "tve-client"].map((l) => account(request, l)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "외부 제작자 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: lead.id });
  const projectId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: "외주 편집 영상", visibility: "team" } }))).project.id as string;
  await invite(request, lead, team, projectId, vendor, "external", "producer");
  await invite(request, lead, team, projectId, client, "external", "reviewer");
  const base = `/dashboard/workspaces/${team}/projects/${projectId}`, root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`;

  const V = await open(browser, vendor, `${base}/files`);
  await V.page.waitForURL((url) => url.pathname === `${base}/files`);
  let uploadId = "";
  V.page.on("response", async (response) => {
    if (response.url() === `${root}/uploads` && response.request().method() === "POST" && response.status() === 201)
      uploadId = (await response.json()).data.upload.id;
  });
  await V.page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("output");
  await upload(V.page, "cut-v1.mp4");
  await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: vendor.headers }))).versions.length, { timeout: 90_000 }).toBe(1);
  await expect.poll(() => uploadId).toBeTruthy();
  const version = (await json(request.get(`${root}/files`, { headers: vendor.headers }))).versions[0];
  const list = await json(request.get(`${root}/publications`, { headers: vendor.headers }));
  const registered = await request.post(`${root}/publications`, { headers: vendor.headers, data: {
    requestKey: randomUUID(), participationId: list.currentParticipationId, originWorkId: "vendor-work", originResultId: "vendor-render", originRequestId: null,
    basisRevision: list.projectRevision, uploadId, title: "외주 1차 편집본", generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size,
  } });
  expect(registered.status(), await registered.text()).toBe(201);
  await expect.poll(async () => (await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews.length, { timeout: 120_000 }).toBe(1);
  const reviewId = (await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews[0].id as string;

  // The vendor opens it from S34 and comments on S14.
  await V.page.goto(`${base}/reviews`);
  await expect(V.page.getByRole("link", { name: /외주 1차 편집본/ })).toBeVisible({ timeout: 30_000 });
  await V.page.getByRole("link", { name: /외주 1차 편집본/ }).click();
  await expect(V.page.getByText(/V1 · 회차 1/)).toBeVisible({ timeout: 30_000 });
  const note = "외주 제작자 메모: 2초 지점 컷 확인";
  const commented = await request.post(`${root}/reviews/${reviewId}/comments`, { headers: vendor.headers, data: { requestKey: randomUUID(), round: 1, versionId: version.id, body: note, startMs: 2000, endMs: null } });
  expect(commented.status(), await commented.text()).toBe(201);
  await V.page.reload();
  await expect(V.page.getByText(note, { exact: true })).toBeVisible({ timeout: 30_000 });
  await shot(V.page, "s14-external-maker-own-round");

  // Another external participant still sees nothing.
  expect((await json(request.get(`${root}/reviews`, { headers: client.headers }))).reviews).toEqual([]);
  expect((await request.get(`${root}/reviews/${reviewId}`, { headers: client.headers })).status()).toBe(404);
  const C = await open(browser, client, `${base}/reviews`);
  await expect(C.page.getByText("아직 검토가 없습니다.", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(C.page.locator("body")).not.toContainText("외주 1차 편집본");

  for (const view of [V, C]) expect(view.errors).toEqual([]);
  await Promise.all([V, C].map((v) => v.close()));
});
