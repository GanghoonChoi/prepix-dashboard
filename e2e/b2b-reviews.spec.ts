import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Local acceptance only: the backend preview harness with B2B_TEST_ENABLED,
// TEAM_TEST_STORAGE, B2B_TEST_FILES (ClamD protocol double, real ffprobe) and
// B2B_TEST_PREVIEW (real ffmpeg worker step), an explicit
// WORKSPACES_TEST_DATABASE_URL and B2B_E2E_MEDIA_DIR with cut-v1.mp4,
// cut-v2.mp4 (6 s) and long-cut.mp4 (10 s, above the 8 s local limit).
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3518";
const media = process.env.B2B_E2E_MEDIA_DIR ?? "";
const password = "LocalPreview123";
type Account = Awaited<ReturnType<typeof account>>;

async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
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
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  await request.post(`${api}/v2/auth/email/verify/request`, { headers });
  let verifyUrl = "";
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      verifyUrl =
        mail.findLast(
          (m: { to: string; verifyUrl?: string }) =>
            m.to === email && m.verifyUrl,
        )?.verifyUrl ?? "";
      return verifyUrl;
    })
    .toBeTruthy();
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/confirm`, {
        data: { token: new URL(verifyUrl).searchParams.get("token") },
      })
    ).status(),
  ).toBe(200);
  return { email, headers, id: session.user.id as string, label };
}
function fixture(script: string, input: object) {
  expect(process.env.WORKSPACES_TEST_DATABASE_URL).toBeTruthy();
  execFileSync(
    process.execPath,
    [
      resolve(
        process.env.B2B_E2E_FIXTURE_DIR ?? "../prepix-backend/backend/scripts",
        script,
      ),
      JSON.stringify(input),
    ],
    { timeout: 15_000 },
  );
}
async function invite(
  request: APIRequestContext,
  lead: Account,
  team: string,
  projectId: string,
  user: Account,
  kind: "internal" | "external",
  role: "producer" | "reviewer",
) {
  const known = new Set(
    (await (await request.get(`${api}/__test/mail`)).json()).map(
      (m: { inviteUrl?: string }) => m.inviteUrl,
    ),
  );
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team}/b2b/invitations`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          email: user.email,
          kind,
          teamRole: role === "reviewer" ? "reviewer" : "editor",
          projectId,
          projectRole: role,
          canDownload: false,
        },
      })
    ).status(),
  ).toBe(201);
  let inviteUrl = "";
  await expect
    .poll(
      async () => {
        const mail = await (await request.get(`${api}/__test/mail`)).json();
        inviteUrl =
          mail.findLast(
            (m: { to: string; inviteUrl?: string }) =>
              m.to === user.email &&
              m.inviteUrl?.includes("/b2b-invitations/") &&
              !known.has(m.inviteUrl),
          )?.inviteUrl ?? "";
        return inviteUrl;
      },
      { timeout: 30_000 },
    )
    .toBeTruthy();
  const token = new URL(inviteUrl).pathname.split("/").at(-1);
  expect(
    (
      await request.post(`${api}/v2/b2b/invitations/${token}/accept`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(201);
}
async function open(browser: Browser, user: Account, target: string) {
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  return { page, errors, close: () => context.close() };
}
async function upload(page: Page, name: string, newVersionOf?: string) {
  await expect(
    page.getByRole("heading", { name: "프로젝트 자료", exact: true }),
  ).toBeVisible();
  if (newVersionOf)
    await page
      .getByRole("combobox", { name: "등록 방식", exact: true })
      .selectOption({ label: `기존 자료의 새 버전: ${newVersionOf}` });
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name,
    mimeType: "video/mp4",
    buffer: await readFile(resolve(media, name)),
  });
  await page.getByRole("button", { name: "팀에 보관 시작", exact: true }).click();
}
async function videoReady(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .evaluate((v: HTMLVideoElement) => v.readyState)
          .catch(() => 0),
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(2);
}
const shots = process.env.B2B_E2E_SHOTS;
async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`), fullPage: true });
}
const json = async (r: Promise<import("@playwright/test").APIResponse>) =>
  (await (await r).json()).data;

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
        data: { requestKey: randomUUID(), name: "브랜드 영상" },
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

  // The lead starts a review in the browser. No preview exists before.
  const L = await open(browser, lead, `${base}/reviews`);
  await expect(L.page.getByRole("heading", { name: "영상 검토", exact: true })).toBeVisible();
  await L.page.getByRole("button", { name: "새 검토", exact: true }).click();
  await L.page.getByLabel("검토 제목", { exact: true }).fill("1차 편집 검토");
  await L.page.getByRole("radio", { name: /cut-v1\.mp4 · V1/ }).check();
  await expect(L.page.getByText("검토본 미요청", { exact: true })).toBeVisible();
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
  await L.page.getByRole("button", { name: "이 버전으로 검토 시작", exact: true }).click();
  await expect(L.page.getByRole("heading", { name: "긴 원본 검토", exact: true })).toBeVisible();
  await expect(
    L.page.getByText("원본 형식·길이·크기 문제로 검토본을 만들지 못했습니다", { exact: true }),
  ).toBeVisible({ timeout: 120_000 });
  await L.page.getByRole("button", { name: "검토본 다시 만들기", exact: true }).click();
  await expect
    .poll(
      async () => {
        const failedReview = L.page.url().split("/").at(-1)!;
        const detail = await json(
          request.get(`${root}/reviews/${failedReview}`, { headers: lead.headers }),
        );
        return `${detail.preview.state}:${detail.preview.attempts}`;
      },
      { timeout: 120_000 },
    )
    .toBe("failed:2");

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

  // The lead designates the external reviewer as the one approver.
  await L.page.goto(reviewUrl);
  await L.page
    .getByRole("combobox", { name: "승인자 선택", exact: true })
    .selectOption({ label: "client · 참여자" });
  await L.page.getByRole("button", { name: "승인자 저장", exact: true }).click();
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

  // Restricted share to an outsider: 7-day default, download off.
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
  // A local production build refuses the absolutized localhost returnTo and
  // lands on /dashboard (existing auth rule); the bare share path then opens
  // with the token this tab kept from the fragment.
  await V.page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  if (!V.page.url().includes("/review-shares/"))
    await V.page.goto(new URL(link).pathname);
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
  await L.page.getByRole("button", { name: "버전 선택", exact: true }).click();
  await L.page.getByRole("radio", { name: /· V2$/ }).check();
  await L.page.getByRole("button", { name: "검토본 만들기", exact: true }).click();
  await expect(L.page.getByText("검토본 준비됨", { exact: true })).toBeVisible({ timeout: 120_000 });
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
  // rejected (version changed); only discarding frees the review again, and
  // the text comes back as a draft for the new round.
  await P.page.goto(reviewUrl);
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(P.page.getByRole("button", { name: "이 변경 버리기", exact: true })).toHaveCount(0);
  await P.page.getByRole("button", { name: "같은 내용으로 다시 보내기", exact: true }).click();
  await expect(P.page.getByRole("button", { name: "이 변경 버리기", exact: true })).toBeVisible({ timeout: 30_000 });
  await P.page.getByRole("button", { name: "이 변경 버리기", exact: true }).click();
  await expect(P.page.getByText("결과 확인이 필요한 변경", { exact: true })).toHaveCount(0);
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
  await C.page.goto(`/dashboard/workspaces/${team}`);
  await expect(C.page.getByRole("heading", { name: "검토·승인 업무", exact: true })).toBeVisible();
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
