import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, password, account, fixture, invite, open, upload, videoReady, shot, json } from "./b2b-review-helpers";

test("F14/F15: real review copy, playback and seek, range comments, one approver, restricted share", async ({
  browser,
  request,
}) => {
  test.setTimeout(600_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, producer, client, viewer] = await Promise.all(
    ["owner", "lead", "producer", "client", "viewer"].map((l) =>
      account(request, l),
    ),
  );
  const team = (
    await json(
      request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "검토 인수", requestKey: randomUUID() },
      }),
    )
  ).workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: lead.id });
  const projectId = (
    await json(
      request.post(`${api}/v2/workspaces/${team}/b2b/projects`, {
        headers: lead.headers,
        data: { requestKey: randomUUID(), name: "브랜드 영상", visibility: "private" },
      }),
    )
  ).project.id as string;
  // A new internal employee needs a team manager; the lead invites an
  // existing internal member to the project.
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: producer.id });
  await invite(request, lead, team, projectId, producer, "internal", "producer");
  await invite(request, lead, team, projectId, client, "external", "reviewer");
  const base = `/dashboard/workspaces/${team}/projects/${projectId}`;
  const root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`;

  // Real upload through the existing file flow (ClamD double, real ffprobe).
  const P = await open(browser, producer, `${base}/files`);
  await upload(P.page, "cut-v1.mp4");
  await expect
    .poll(
      async () =>
        (await json(request.get(`${root}/files`, { headers: producer.headers })))
          .versions.length,
      { timeout: 60_000 },
    )
    .toBe(1);
  await upload(P.page, "long-cut.mp4");
  await expect
    .poll(
      async () =>
        (await json(request.get(`${root}/files`, { headers: producer.headers })))
          .versions.length,
      { timeout: 60_000 },
    )
    .toBe(2);
  // The producer's own versions must be readable by the lead (steward grant).
  const versions = (
    await json(request.get(`${root}/files`, { headers: producer.headers }))
  ).versions as { id: string; name: string; assetId: string }[];
  for (const v of versions)
    expect(
      (
        await request.post(`${root}/assets/${v.assetId}/permissions`, {
          headers: producer.headers,
          data: {
            requestKey: randomUUID(),
            revision: 0,
            userId: lead.id,
            canDownload: false,
            canUseForAi: false,
            reason: "Lead reviews the cut",
          },
        })
      ).status(),
    ).toBe(201);

  // Registration queues conversion separately, before a review is published.
  // Even a failed conversion must keep the original registered and readable.
  await expect.poll(async () => {
    const list = await json(request.get(`${root}/files`, { headers: producer.headers }));
    return list.versions.find((v: { name: string }) => v.name === "cut-v1.mp4")?.previewState;
  }, { timeout: 120_000 }).toBe("ready");
  await expect.poll(async () => {
    const list = await json(request.get(`${root}/files`, { headers: producer.headers }));
    return list.versions.find((v: { name: string }) => v.name === "long-cut.mp4")?.previewState;
  }, { timeout: 120_000 }).toBe("failed");
  expect((await json(request.get(`${root}/reviews`, { headers: producer.headers }))).reviews).toHaveLength(0);
  await P.page.reload();
  await expect(P.page.getByText("미리보기 준비됨", { exact: true }).first()).toBeVisible();
  await expect(P.page.getByText("미리보기 처리 실패 · 원본은 보관됨", { exact: true }).first()).toBeVisible();
  const saved = await json(request.get(`${root}/files/${versions.find(v => v.name === "long-cut.mp4")!.id}`, { headers: producer.headers }));
  expect(saved.version.id).toBe(versions.find(v => v.name === "long-cut.mp4")!.id);
  // The lead selects the registered version for a distinct review publication.
  const L = await open(browser, lead, `${base}/reviews`);
  await expect(L.page.getByRole("heading", { name: "영상 검토", exact: true })).toBeVisible();
  await L.page.getByRole("button", { name: "새 검토", exact: true }).click();
  await L.page.getByLabel("검토 제목", { exact: true }).fill("1차 편집 검토");
  await L.page.getByRole("radio", { name: /cut-v1\.mp4 · V1/ }).check();
  await expect(L.page.getByText("검토본 준비됨", { exact: true })).toBeVisible();
  await expect(L.page.getByRole("button", { name: "이 버전으로 검토 시작", exact: true })).toBeDisabled();
  await L.page.getByRole("button", { name: "공개 전 재생", exact: true }).click();
  await videoReady(L.page);
  await L.page.locator("video").evaluate((v: HTMLVideoElement) => v.play());
  await L.page.getByLabel("선택한 검토본 재생을 확인했습니다", { exact: true }).check();
  await L.page.getByRole("radio", { name: "선택한 사람만", exact: true }).check();
  await L.page.getByRole("checkbox", { name: "producer · 편집자", exact: true }).check();
  await L.page.getByRole("checkbox", { name: "client · 뷰어", exact: true }).check();
  await L.page.getByRole("combobox", { name: "승인자 선택", exact: true }).selectOption(client.id);
  await L.page.getByRole("button", { name: "이 버전으로 검토 시작", exact: true }).click();
  await expect(L.page.getByRole("heading", { name: "1차 편집 검토", exact: true })).toBeVisible();
  const reviewUrl = new URL(L.page.url()).pathname;
  const reviewId = reviewUrl.split("/").at(-1)!;
  // Real ffmpeg conversion by the worker step, then real playback in Chrome.
  await videoReady(L.page);
  expect(
    await L.page.locator("video").evaluate((v: HTMLVideoElement) => Math.round(v.duration)),
  ).toBe(6);
  await expect(
    L.page.getByText("이미 발급된 주소는 만료 시각(최대 5분)까지 남을 수 있습니다", { exact: false }),
  ).toBeVisible();
  const src = await L.page.locator("video").getAttribute("src");
  expect(src).toContain("X-Amz-Expires=300");
  const ranged = await request.get(src!, { headers: { Range: "bytes=0-1023" } });
  expect(ranged.status()).toBe(206);

  // Preview failure and retry: the 10 s source exceeds the 8 s local limit.
  await L.page.goto(`${base}/reviews`);
  await L.page.getByRole("button", { name: "새 검토", exact: true }).click();
  await L.page.getByLabel("검토 제목", { exact: true }).fill("긴 원본 검토");
  await L.page.getByRole("radio", { name: /long-cut\.mp4 · V1/ }).check();
  await expect(L.page.getByRole("button", { name: "이 버전으로 검토 시작", exact: true })).toBeDisabled();
  await expect(
    L.page.getByText("원본 형식·길이·크기 문제로 검토본을 만들지 못했습니다", { exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await L.page.getByRole("button", { name: "검토본 다시 만들기", exact: true }).click();
  await expect
    .poll(
      async () => {
        const failedVersion = versions.find((v) => v.name === "long-cut.mp4")!.id;
        const status = await json(request.get(`${root}/review-previews?versionId=${failedVersion}`, { headers: lead.headers }));
        return `${status.preview.state}:${status.preview.attempts}`;
      },
      { timeout: 120_000 },
    )
    .toBe("failed:2");
  expect((await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews).toHaveLength(1);

  // The producer leaves a time-range comment; its reply is lost once.
  await P.page.goto(reviewUrl);
  await videoReady(P.page);
  await P.page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.currentTime = 1.5;
  });
  await expect
    .poll(() => P.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.4);
  await P.page.getByRole("button", { name: "현재 위치를 시작으로", exact: true }).click();
  await P.page.locator("video").evaluate((v: HTMLVideoElement) => {
    v.currentTime = 3.2;
  });
  await expect
    .poll(() => P.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(3.1);
  await P.page.getByRole("button", { name: "현재 위치를 끝으로", exact: true }).click();
  await P.page.getByRole("textbox", { name: "코멘트 내용", exact: true }).fill("여기 무음 구간을 줄여 주세요");
  let posts = 0,
    blocked = false;
  const endpoint = `${root}/reviews/${reviewId}/comments`;
  const lookups = `${root}/review-operations/comment/**`;
  // The reply and the follow-up receipt lookups are lost until reload.
  await P.page.route(lookups, async (route) =>
    blocked ? route.abort() : route.continue(),
  );
  await P.page.route(endpoint, async (route) => {
    posts++;
    blocked = true;
    const reply = await route.fetch();
    expect(reply.status()).toBe(201);
    await route.abort();
  });
  await P.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(
    P.page.getByText("결과 확인이 필요한 변경", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    P.page.getByText("전송 확인 대기 — 아직 공개되지 않았습니다", { exact: false }),
  ).toBeVisible();
  // The unconfirmed text left the composer; it is not sent again.
  await expect(P.page.getByRole("textbox", { name: "코멘트 내용", exact: true })).toHaveValue("");
  blocked = false;
  await P.page.unroute(endpoint);
  await P.page.unroute(lookups);
  await P.page.reload();
  // The receipt lookup confirms the original key; the provisional copy goes.
  await expect(P.page.getByRole("article")).toHaveCount(0);
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true })).toHaveCount(0);
  await expect(
    P.page.getByRole("listitem").getByText("여기 무음 구간을 줄여 주세요", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
  const afterLoss = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
  expect(afterLoss.comments).toHaveLength(1);
  expect(afterLoss.comments[0].startMs).toBeGreaterThanOrEqual(1400);
  expect(afterLoss.comments[0].endMs).toBeGreaterThanOrEqual(3100);
  // An unsent draft survives a reload on this device and is not published.
  await P.page.getByRole("textbox", { name: "코멘트 내용", exact: true }).fill("아직 보내지 않은 초안");
  await P.page.waitForTimeout(600);
  await P.page.reload();
  await expect(P.page.getByRole("heading", { name: "1차 편집 검토", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(P.page.getByRole("textbox", { name: "코멘트 내용", exact: true })).toHaveValue("아직 보내지 않은 초안", { timeout: 30_000 });
  expect(
    (await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }))).comments,
  ).toHaveLength(1);
  await shot(P.page, "s14-producer");
  // Seek by the comment's timecode.
  await videoReady(P.page);
  await P.page.getByRole("button", { name: /^00:00:01\.\d{3} – 00:00:03\.\d{3}$/ }).click();
  await expect
    .poll(() => P.page.locator("video").evaluate((v: HTMLVideoElement) => v.currentTime))
    .toBeGreaterThan(1.3);

  // Publication already fixed its selected audience and one approver.
  await L.page.goto(reviewUrl);
  await expect(L.page.getByText("승인 대기", { exact: true })).toBeVisible();
  // The producer is not the approver: no decision buttons.
  await P.page.reload();
  await expect(P.page.getByRole("button", { name: "승인", exact: true })).toHaveCount(0);
  const C = await open(browser, client, reviewUrl);
  await videoReady(C.page);
  await C.page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(C.page.getByText("승인", { exact: true }).first()).toBeVisible();
  await expect
    .poll(async () =>
      (await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }))).approval,
    )
    .toBe("approved");

  // A non-participant owner sees nothing: no title, no count.
  expect(
    (await request.get(`${root}/reviews/${reviewId}`, { headers: owner.headers })).status(),
  ).toBe(404);
  const ownerWork = await json(
    request.get(`${api}/v2/workspaces/${team}/b2b/review-work`, { headers: owner.headers }),
  );
  expect(ownerWork.cards).toHaveLength(0);
  expect(ownerWork.counts.awaiting + ownerWork.counts.approvals).toBe(0);
  const O = await open(browser, owner, reviewUrl);
  await expect(
    O.page.getByText("검토를 찾을 수 없거나 볼 수 있는 범위가 아닙니다.", { exact: false })
      .or(O.page.getByRole("alert").filter({ hasText: /찾을 수 없|접근/ })),
  ).toBeVisible({ timeout: 30_000 });
  await expect(O.page.getByText("1차 편집 검토", { exact: false })).toHaveCount(0);
  await O.close();

  // Restricted share to an outsider: 7-day default, download off. Sharing
  // opens from the review's 공유 button (2026-10-08).
  await L.page.getByRole("button", { name: "공유", exact: true }).click();
  await L.page.getByLabel("공유받을 사람 이메일(쉼표·줄바꿈 구분, 최대 20명)", { exact: true }).fill(viewer.email);
  await L.page.getByRole("button", { name: "공유하기", exact: true }).click();
  const linkBox = L.page.getByLabel("공유 링크", { exact: true });
  await expect(linkBox).toBeVisible();
  const link = await linkBox.inputValue();
  expect(link).toMatch(/\/dashboard\/review-shares\/[0-9a-f-]{36}#t=[0-9a-f]{64}$/);
  const shares = await json(
    request.get(`${root}/reviews/${reviewId}/shares`, { headers: lead.headers }),
  );
  const share = shares.shares[0];
  expect(share.allowDownload).toBe(false);
  expect(
    Math.round((Date.parse(share.expiresAt) - Date.now()) / 86_400_000),
  ).toBe(7);
  // Signed out, the link sends the viewer to login; the fragment token is
  // kept for this tab only and the share opens after signing in.
  const viewerContext = await browser.newContext({ locale: "ko-KR" });
  const V = {
    page: await viewerContext.newPage(),
    errors: [] as string[],
    close: () => viewerContext.close(),
  };
  V.page.on("pageerror", (e) => V.errors.push(e.message));
  await V.page.goto(link);
  await V.page.getByLabel("이메일", { exact: true }).fill(viewer.email);
  await V.page.getByLabel("비밀번호", { exact: true }).fill(password);
  await V.page.getByRole("button", { name: "계속하기", exact: true }).click();
  // Authentication returns directly to the share without reopening its URL.
  await V.page.waitForURL(/\/dashboard\/review-shares\//, { timeout: 30_000 });
  await expect(V.page.getByRole("heading", { name: "1차 편집 검토", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(V.page.getByText("이 링크로 프로젝트의 다른 자료·요청·검토에는 들어갈 수 없습니다", { exact: false })).toBeVisible();
  expect(V.page.url()).not.toContain("#t=");
  await videoReady(V.page);
  await shot(V.page, "s14-share-viewer");
  await expect(V.page.getByRole("button", { name: /원본 받기/ })).toHaveCount(0);
  await V.page.getByRole("textbox", { name: "코멘트 내용", exact: true }).fill("클라이언트 의견: 로고가 늦게 나옵니다");
  await V.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(V.page.getByText("클라이언트 의견: 로고가 늦게 나옵니다", { exact: true })).toBeVisible();
  expect(
    (await request.get(`${root}/reviews`, { headers: viewer.headers })).status(),
  ).toBe(404);
  expect(
    (await request.get(`${root}/files`, { headers: viewer.headers })).status(),
  ).toBe(404);
  const token = new URL(link).hash.slice(3);
  expect(
    (
      await request.post(`${api}/v2/b2b/review-shares/${share.id}/download`, {
        headers: { ...viewer.headers, "X-Prepix-Review-Share-Token": token },
      })
    ).status(),
  ).toBe(403);
  // Revocation: no new playback URL afterwards.
  await L.page.reload();
  await L.page.getByRole("button", { name: "공유", exact: true }).click();
  await L.page.getByLabel("회수 사유", { exact: true }).fill("잘못 보낸 공유");
  await L.page.getByRole("button", { name: "공유 회수", exact: true }).click();
  await expect(L.page.getByText("회수 사유: 잘못 보낸 공유", { exact: false })).toBeVisible();
  expect(
    (
      await request.post(`${api}/v2/b2b/review-shares/${share.id}/playback`, {
        headers: { ...viewer.headers, "X-Prepix-Review-Share-Token": token },
      })
    ).status(),
  ).toBe(403);
  await V.page.reload();
  await expect(V.page.getByText("이 공유 접근은 종료되었습니다", { exact: false })).toBeVisible();

  // A comment whose first send never reached the server stays pending.
  const lostBody = "새 회차에서 다시 쓸 코멘트";
  const lostEndpoint = `${root}/reviews/${reviewId}/comments`;
  let lostPosts = 0;
  await P.page.goto(reviewUrl);
  await P.page.getByRole("textbox", { name: "코멘트 내용", exact: true }).fill(lostBody);
  await P.page.route(lostEndpoint, async (route) => {
    lostPosts++;
    await route.abort();
  });
  await P.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true }).first()).toBeVisible();
  await P.page.unroute(lostEndpoint);
  expect(lostPosts).toBe(1);

  // A new version opens round 2: nothing carries over, decisions do not apply.
  await P.page.goto(`${base}/files`);
  await upload(P.page, "cut-v2.mp4", "cut-v1.mp4");
  await expect
    .poll(
      async () =>
        (await json(request.get(`${root}/files`, { headers: producer.headers })))
          .versions.length,
      { timeout: 60_000 },
    )
    .toBe(3);
  // The lead's series grant from V1 already covers the new version.
  await L.page.goto(reviewUrl);
  // Swapping the video is folded under 고급 설정 (2026-10-08).
  await L.page.getByText("고급 설정", { exact: true }).click();
  await L.page.getByRole("button", { name: "버전 선택", exact: true }).click();
  await L.page.getByRole("radio", { name: /· V2$/ }).check();
  await expect(L.page.getByText("검토본 준비됨", { exact: true })).toBeVisible({ timeout: 120_000 });
  await L.page.getByRole("button", { name: "공개 전 재생", exact: true }).click();
  const beforePublish = L.page.getByLabel("공개 전 검토본 재생", { exact: true });
  await expect.poll(() => beforePublish.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 120_000 }).toBeGreaterThanOrEqual(2);
  await beforePublish.evaluate((v: HTMLVideoElement) => v.play());
  await L.page.getByLabel("선택한 검토본 재생을 확인했습니다", { exact: true }).check();
  const replacing = L.page.getByRole("heading", { name: "새 영상 버전으로 교체", exact: true }).locator("..");
  await replacing.getByRole("radio", { name: "선택한 사람만", exact: true }).check();
  await replacing.getByRole("checkbox", { name: "producer · 편집자", exact: true }).check();
  await replacing.getByRole("checkbox", { name: "client · 뷰어", exact: true }).check();
  await replacing.getByRole("combobox", { name: "승인자 선택", exact: true }).selectOption(client.id);
  await replacing.getByLabel("영상 교체 사유(필수)", { exact: true }).fill("Feedback applied to version 2");
  await L.page.getByRole("button", { name: "이 버전으로 교체", exact: true }).click();
  await expect(L.page.getByText(/V2 · 회차 2/)).toBeVisible();
  await videoReady(L.page);
  await shot(L.page, "s14-lead-round2");
  const round2 = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
  expect(round2.review.round).toBe(2);
  expect(round2.comments).toHaveLength(0);
  expect(round2.approval).toBe("awaiting");
  const round1 = await json(request.get(`${root}/reviews/${reviewId}?round=1`, { headers: lead.headers }));
  expect(round1.comments.map((c: { body: string }) => c.body).sort()).toEqual(
    ["여기 무음 구간을 줄여 주세요", "클라이언트 의견: 로고가 늦게 나옵니다"].sort(),
  );
  await L.page.getByRole("button", { name: /V1 · 이전 검토/ }).click();
  await expect(L.page.getByText("이전 검토(읽기 전용)", { exact: false })).toBeVisible();
  await expect(L.page.getByRole("button", { name: "코멘트 남기기", exact: true })).toHaveCount(0);

  // M1: the lead swapped to V2 while the comment was pending. The resend is
  // rejected (version changed). (integration) The one shared release rule
  // (lib/api/session.ts releaseRejected): a refused resend frees the record
  // once the original-key lookup proves nothing was applied, so no manual
  // discard is needed, and the text comes back as a draft for the new round.
  await P.page.goto(reviewUrl);
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(P.page.getByRole("button", { name: "이 변경 버리기", exact: true })).toHaveCount(0);
  await P.page.getByRole("button", { name: "같은 내용으로 다시 보내기", exact: true }).click();
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  await expect(P.page.getByRole("button", { name: "이 변경 버리기", exact: true })).toHaveCount(0);
  await expect(P.page.getByRole("textbox", { name: "코멘트 내용", exact: true })).toHaveValue(lostBody, { timeout: 30_000 });
  await P.page.getByRole("button", { name: "코멘트 남기기", exact: true }).click();
  await expect(P.page.getByRole("listitem").getByText(lostBody, { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(lostPosts).toBe(1);
  expect(
    (await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }))).comments.map(
      (c: { body: string }) => c.body,
    ),
  ).toEqual([lostBody]);

  // Team home and overview show review work from current ACL only.
  const clientWork = await json(
    request.get(`${api}/v2/workspaces/${team}/b2b/review-work`, { headers: client.headers }),
  );
  expect(clientWork.counts.approvals).toBe(1);
  // The client is a viewer: their home is the project list (2026-10-08),
  // and what waits on them shows there.
  await C.page.goto(`/dashboard/workspaces/${team}`);
  await C.page.waitForURL((url) => url.pathname === `/dashboard/workspaces/${team}/projects`);
  await expect(C.page.getByRole("heading", { name: /^확인할 영상/ })).toBeVisible();
  await expect(C.page.getByText("1차 편집 검토", { exact: true })).toBeVisible();
  await shot(C.page, "team-home-review-work");
  await C.page.setViewportSize({ width: 390, height: 844 });
  await C.page.goto(reviewUrl);
  await videoReady(C.page);
  expect(
    await C.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await shot(C.page, "s14-mobile-390");
  await L.page.goto(`${base}/reviews`);
  await expect(L.page.getByRole("heading", { name: "영상 검토", exact: true })).toBeVisible();
  await shot(L.page, "s34-list");
  for (const view of [P, L, C, V]) expect(view.errors).toEqual([]);
  await Promise.all([P, L, C, V].map((v) => v.close()));
});
