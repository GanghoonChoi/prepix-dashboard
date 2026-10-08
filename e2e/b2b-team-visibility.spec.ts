import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, account, fixture, invite, open, upload, videoReady, shot, json } from "./b2b-review-helpers";

// SOT: prepix-backend backend/docs/b2b-team-visibility.md. Team-wide by
// default, private on demand; a registered result is published to review as
// soon as its review copy is ready, without a lead step.
test("V: team-wide project, publish → review on team home, private stays hidden, narrowing ends a viewer's access", async ({ browser, request }) => {
  test.setTimeout(600_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, producer, member, client, maker] = await Promise.all(
    ["tv-owner", "tv-lead", "tv-producer", "tv-member", "tv-client", "tv-maker"].map((l) => account(request, l)),
  );
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "팀 공개 인수", requestKey: randomUUID() } }))).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  for (const user of [lead, producer, maker]) fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: user.id });
  // 2026-10-07: on a team project every internal member is a maker by default
  // except workspace reviewers, so the read-only viewer is a team reviewer.
  await invite(request, owner, team, null, member, "internal", "reviewer");
  const home = `/dashboard/workspaces/${team}`;
  const teamName = "팀 공개 브랜드 영상", secretName = "비밀 런칭 영상";

  // S06: the lead's first share from the app makes a team-wide project (the
  // default); projects are never made on the web (2026-10-09).
  const projectId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: teamName } }))).project.id as string;
  const L = await open(browser, lead, `${home}/projects/${projectId}`);
  await expect(L.page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
  await expect(L.page.getByText("팀 공개", { exact: true }).first()).toBeVisible();
  const secretId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: secretName, visibility: "private" } }))).project.id as string;
  await invite(request, lead, team, projectId, producer, "internal", "producer");
  await invite(request, lead, team, projectId, client, "external", "reviewer");
  const base = `${home}/projects/${projectId}`, root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`;

  // The producer stores a result through the real web upload and registers
  // it (the app's publish step); nobody publishes it by hand.
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
    basisRevision: list.projectRevision, uploadId, title: "첫 발행 결과", generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size,
  } });
  expect(registered.status(), await registered.text()).toBe(201);
  // The plain team member (no participation) gets it as soon as it is ready.
  await expect.poll(async () => (await json(request.get(`${root}/reviews`, { headers: member.headers }))).reviews.length, { timeout: 120_000 }).toBe(1);
  const reviewId = (await json(request.get(`${root}/reviews`, { headers: member.headers }))).reviews[0].id as string;
  expect((await request.get(`${root}/requests`, { headers: member.headers })).status()).toBe(403);
  // The 등록된 결과 page retired (2026-10-08): its address, which older apps
  // still open after a share, lands on the project's videos.
  await P.page.goto(`${base}/publications`);
  await P.page.waitForURL((url) => url.pathname === base);
  await expect(P.page.getByRole("link", { name: /첫 발행 결과/ }).first()).toBeVisible({ timeout: 30_000 });
  await shot(P.page, "publications-auto-published");

  // S04: a viewer (team role "reviewer") has no team home (2026-10-08): it
  // opens on the projects shared with them, then the project's videos; they
  // play one and leave a range comment.
  const M = await open(browser, member, home);
  await M.page.waitForURL((url) => url.pathname === `${home}/projects`);
  const shared = M.page.getByRole("row", { name: new RegExp(teamName) });
  await expect(shared).toContainText("뷰어", { timeout: 30_000 });
  await expect(M.page.getByText(secretName, { exact: false })).toHaveCount(0);
  await shot(M.page, "s04-viewer-projects");
  await shared.getByRole("link").click();
  await M.page.getByRole("link", { name: /첫 발행 결과/ }).first().click();
  await M.page.waitForURL(new RegExp(`/reviews/${reviewId}`));
  // Everyone in the project is the default audience: no line says so (2026-10-08).
  await expect(M.page.getByText(/현재 검토 대상/)).toHaveCount(0);
  await videoReady(M.page);
  await M.page.locator("video").evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
  await expect.poll(() => M.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.3);
  await M.page.locator("video").evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 1.2; });
  await expect.poll(() => M.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1.1);
  await M.page.getByRole("button", { name: "현재 위치를 시작으로", exact: true }).click();
  await M.page.locator("video").evaluate((v: HTMLVideoElement) => { v.currentTime = 3.4; });
  await expect.poll(() => M.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(3.3);
  await M.page.getByRole("button", { name: "현재 위치를 끝으로", exact: true }).click();
  await M.page.getByRole("textbox", { name: "코멘트 내용", exact: true }).fill("팀원 의견: 로고 전환이 빠릅니다");
  await M.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(M.page.getByRole("listitem").getByText("팀원 의견: 로고 전환이 빠릅니다", { exact: true })).toBeVisible();
  const comments = (await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }))).comments;
  expect(comments).toHaveLength(1);
  expect(comments[0].startMs).toBeGreaterThanOrEqual(1100);
  expect(comments[0].endMs).toBeGreaterThanOrEqual(3300);
  await shot(M.page, "s14-member-comment");

  // S07 as a viewer: overview, files and reviews only; no work surface loads.
  const work: string[] = [];
  M.page.on("request", (r) => { if (/\/(request-work|requests|people|publications|delivery)(\?|$)/.test(r.url())) work.push(r.url()); });
  await M.page.goto(base);
  await expect(M.page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
  await expect(M.page.getByText("팀 공개 프로젝트를 열람 중입니다. 작업하려면 담당자에게 참여를 요청하세요.", { exact: true })).toBeVisible();
  for (const name of ["요청사항", "납품·프로젝트 완료", "등록된 결과", "참여자", "AI 작업", "앱에서 작업하기"])
    await expect(M.page.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(M.page.getByRole("button", { name: "비공개로 바꾸기", exact: true })).toHaveCount(0);
  await M.page.waitForTimeout(2_000);
  await expect(M.page.getByRole("heading", { name: teamName, exact: true })).toBeVisible();
  await expect(M.page.getByText("프로젝트를 찾을 수 없거나 접근 권한이 없습니다.", { exact: true })).toHaveCount(0);
  expect(work).toEqual([]);
  await shot(M.page, "s07-member-viewer");
  await M.page.getByRole("link", { name: "자료", exact: true }).click();
  await expect(M.page.getByRole("heading", { name: "cut-v1.mp4", exact: true })).toBeVisible();
  await expect(M.page.getByRole("button", { name: "원본 다운로드", exact: true })).toHaveCount(0);

  // Any other internal member is a maker on the team project without joining
  // it: the shared cloud is everyone's (upload, original download).
  const made = (await json(request.get(root, { headers: maker.headers }))).project;
  expect([made.role, made.allowedActions.upload, made.allowedActions.download]).toEqual(["producer", true, true]);
  const K = await open(browser, maker, `${base}/files`);
  await expect(K.page.getByRole("heading", { name: "cut-v1.mp4", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(K.page.getByRole("button", { name: "원본 다운로드", exact: true })).toBeVisible();
  await shot(K.page, "s10-team-maker-files");

  // The owner (not participating) sees the team project, never the private one.
  const O = await open(browser, owner, home);
  // The home grid (2026-10-08): the project's card counts its video.
  const card = O.page.getByRole("region", { name: "프로젝트", exact: true }).getByRole("link", { name: new RegExp(teamName) });
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText("영상 1");
  const hidden = async (page: Page) => expect(page.locator("body")).not.toContainText(secretName);
  await hidden(O.page);
  await O.page.goto(`${home}/projects`);
  await expect(O.page.getByRole("link", { name: new RegExp(teamName) })).toBeVisible();
  await hidden(O.page);
  await O.page.getByLabel("이름으로 검색", { exact: true }).fill("비밀");
  await expect(O.page.getByText("참여한 프로젝트가 없습니다.", { exact: false })).toBeVisible();
  await hidden(O.page);
  expect((await request.get(`${api}/v2/workspaces/${team}/b2b/projects/${secretId}`, { headers: owner.headers })).status()).toBe(404);
  await O.page.goto(`${home}/projects/${secretId}`);
  await expect(O.page.getByText("프로젝트를 찾을 수 없거나 접근 권한이 없습니다.", { exact: true })).toBeVisible();
  await hidden(O.page);

  // The external client sees only the invited project.
  const C = await open(browser, client, `${home}/projects`);
  await expect(C.page.getByRole("link", { name: new RegExp(teamName) })).toBeVisible({ timeout: 30_000 });
  await hidden(C.page);
  expect((await json(request.get(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: client.headers }))).projects.map((p: { id: string }) => p.id)).toEqual([projectId]);

  // Same visibility and an unconfirmed widening are refused by the server.
  const revision = async () => (await json(request.get(root, { headers: lead.headers }))).project.revision as number;
  const same = await request.post(`${root}/visibility`, { headers: lead.headers, data: { requestKey: randomUUID(), revision: await revision(), visibility: "team", confirmTeamWide: true, reason: "x" } });
  expect([same.status(), (await same.json()).message]).toEqual([409, "B2B_PROJECT_VISIBILITY_UNCHANGED"]);
  expect((await request.post(`${root}/visibility`, { headers: member.headers, data: { requestKey: randomUUID(), revision: await revision(), visibility: "private" } })).status()).toBe(403);

  // S07: the lead narrows to private with the confirmation dialog.
  await L.page.reload();
  // Who sees a project is a setting (2026-10-08).
  await L.page.getByRole("button", { name: "설정", exact: true }).click();
  await L.page.getByRole("button", { name: "비공개로 바꾸기", exact: true }).click();
  const narrow = L.page.getByRole("alertdialog", { name: "비공개로 바꾸기" });
  await expect(narrow).toContainText("그동안 남긴 코멘트는 기록에 남습니다");
  await shot(L.page, "s07-narrow-dialog");
  await narrow.getByRole("button", { name: "비공개로 바꾸기", exact: true }).click();
  await expect(narrow).toHaveCount(0);
  await expect(L.page.getByText("비공개", { exact: true }).first()).toBeVisible();
  await expect(L.page.getByRole("button", { name: "팀 전체 공개로 바꾸기", exact: true })).toBeVisible();

  // The member's next action ends access and clears what was shown.
  await M.page.goto(base);
  await expect(M.page.getByText("프로젝트를 찾을 수 없거나 접근 권한이 없습니다.", { exact: true })).toBeVisible();
  await expect(M.page.getByRole("heading", { name: teamName, exact: true })).toHaveCount(0);
  await M.page.goto(`${base}/reviews/${reviewId}`);
  await expect(M.page.getByText("프로젝트를 찾을 수 없거나 접근 권한이 없습니다.", { exact: true })).toBeVisible();
  await expect(M.page.getByText("팀원 의견: 로고 전환이 빠릅니다", { exact: true })).toHaveCount(0);
  // A viewer's home is the project list (2026-10-08): the project is gone from it.
  await M.page.goto(home);
  await M.page.waitForURL((url) => url.pathname === `${home}/projects`);
  await expect(M.page.getByText("참여한 프로젝트가 없습니다.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(M.page.locator("body")).not.toContainText(teamName);
  await shot(M.page, "s04-member-after-private");
  // Internal participants keep it; the external client never had the
  // automatic round (2026-10-07: externals only when the lead opens one).
  expect((await request.get(`${root}/reviews/${reviewId}`, { headers: producer.headers })).status()).toBe(200);
  expect((await request.get(`${root}/reviews/${reviewId}`, { headers: client.headers })).status()).toBe(404);

  // S07: widening again is one confirm click (2026-10-08).
  await L.page.getByRole("button", { name: "팀 전체 공개로 바꾸기", exact: true }).click();
  const widen = L.page.getByRole("alertdialog", { name: "팀 전체 공개로 바꾸기" });
  await expect(widen).toContainText("팀의 모든 내부 멤버가 이 프로젝트, 발행된 영상과 그 코멘트를 보고 코멘트할 수 있게 됩니다");
  const confirm = widen.getByRole("button", { name: "팀 전체 공개로 바꾸기", exact: true });
  await expect(confirm).toBeEnabled();
  await shot(L.page, "s07-widen-dialog");
  await confirm.click();
  await expect(widen).toHaveCount(0);
  await expect(L.page.getByText("팀 공개", { exact: true }).first()).toBeVisible();
  const back = await json(request.get(root, { headers: member.headers }));
  expect([back.project.visibility, back.project.role]).toEqual(["team", "viewer"]);
  // Back in the viewer's project list, and its video with it.
  await M.page.goto(home);
  await M.page.waitForURL((url) => url.pathname === `${home}/projects`);
  await M.page.getByRole("row", { name: new RegExp(teamName) }).getByRole("link").click();
  await expect(M.page.getByRole("link", { name: /첫 발행 결과/ }).first()).toBeVisible({ timeout: 30_000 });

  for (const view of [L, P, M, O, C, K]) expect(view.errors).toEqual([]);
  await Promise.all([L, P, M, O, C, K].map((v) => v.close()));
});
