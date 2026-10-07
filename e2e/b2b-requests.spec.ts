import {
  test,
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { harnessEnv } from "./harness-env";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Local acceptance only: start the backend preview harness with
// B2B_TEST_ENABLED, TEAM_TEST_STORAGE and B2B_TEST_FILES, and the request
// tables applied to the same explicit WORKSPACES_TEST_DATABASE_URL.
// Serve the web with `next dev`: the reference receipt downloads from the
// local http MinIO, and the download engine accepts a loopback http storage
// URL only in development (a production build requires https, by design).
const api = harnessEnv("B2B_E2E_API_URL");
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
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/request`, { headers })
    ).status(),
  ).toBe(200);
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
  return { email, headers, id: session.user.id as string };
}
function fixture(script: string, input: object) {
  // Never fall back to the fixture's default database.
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
  const priorMail = await (await request.get(`${api}/__test/mail`)).json();
  const previousUrl =
    priorMail.findLast(
      (m: { to: string; inviteUrl?: string }) =>
        m.to === user.email && m.inviteUrl,
    )?.inviteUrl ?? "";
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
              m.to === user.email && m.inviteUrl?.includes("/b2b-invitations/"),
          )?.inviteUrl ?? "";
        return inviteUrl !== previousUrl ? inviteUrl : "";
      },
      { timeout: 30000 },
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
  // Expected 4xx resource loads are not app errors; React warnings are.
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  await loginOnPage(page, user, target);
  return { page, errors, close: () => context.close() };
}
async function loginOnPage(page: Page, user: Account, target: string) {
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}
async function lostReply(
  page: Page,
  root: string,
  action: string,
  endpoint: string,
  click: () => Promise<unknown>,
  whilePending?: () => Promise<void>,
) {
  let posts = 0,
    blocked = false,
    originalKey = "";
  const recovered: string[] = [];
  const operationPath = `${root}/requests/operations/${action}/**`;
  await page.route(operationPath, async (route) => {
    if (blocked) await route.abort();
    else {
      if (originalKey)
        recovered.push(
          new URL(route.request().url()).pathname.split("/").at(-1)!,
        );
      await route.continue();
    }
  });
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    posts++;
    originalKey = route.request().postDataJSON().requestKey;
    blocked = true;
    const reply = await route.fetch();
    expect(reply.status()).toBe(201);
    await route.abort();
  });
  await click();
  await expect(
    page.getByText("응답을 확인하지 못한 요청 변경이 있습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  const storedKeys = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("prepix-b2b-project-requests", 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const get = db
          .transaction("operations")
          .objectStore("operations")
          .getAll();
        get.onsuccess = () =>
          resolve(get.result.map((r) => r.input.requestKey));
        get.onerror = () => reject(get.error);
      });
    } finally {
      db.close();
    }
  });
  expect(storedKeys).toContain(originalKey);
  expect(posts).toBe(1);
  if (whilePending) await whilePending();
  blocked = false;
  await page.reload();
  await expect(
    page.getByText("원래 요청의 변경 결과를 확인했습니다.", { exact: false }),
  ).toBeVisible();
  expect(posts).toBe(1);
  expect(recovered.length).toBeGreaterThan(0);
  expect(recovered.every((key) => key === originalKey)).toBe(true);
  await page.unroute(operationPath);
  await page.unroute(endpoint);
}
function wav(size: number) {
  const value = Buffer.alloc(size, 17);
  value.write("RIFF", 0);
  value.writeUInt32LE(size - 8, 4);
  value.write("WAVEfmt ", 8);
  value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20);
  value.writeUInt16LE(1, 22);
  value.writeUInt32LE(8000, 24);
  value.writeUInt32LE(16000, 28);
  value.writeUInt16LE(2, 32);
  value.writeUInt16LE(16, 34);
  value.write("data", 36);
  value.writeUInt32LE(size - 44, 40);
  return value;
}

test("F13 requests by role: exact-version submission after a lost response, confirmation, criteria change, proposal and waiver", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const lead = await account(request, "req-lead");
  const external = await account(request, "req-external");
  const reviewer = await account(request, "req-reviewer");
  const member = await account(request, "req-member");
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: lead.headers,
    data: {
      name: `요청 인수 ${randomUUID().slice(0, 8)}`,
      requestKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const team = (await created.json()).data.workspace.id as string;
  // Applies a real test purchase so the team has a period and storage.
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  fixture("b2b-test-fixture.cjs", {
    workspaceId: team,
    action: "join",
    userId: member.id,
  });
  const made = await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, {
    headers: lead.headers,
    data: { requestKey: randomUUID(), name: "브랜드 영상", visibility: "private" },
  });
  expect(made.status()).toBe(201);
  const project = (await made.json()).data.project.id as string;
  await invite(request, lead, team, project, external, "external", "producer");
  await invite(request, lead, team, project, reviewer, "internal", "reviewer");
  const base = `/dashboard/workspaces/${team}/projects/${project}`;
  const root = `${api}/v2/workspaces/${team}/b2b/projects/${project}`;

  // Lead registers a required request from the project overview.
  const leadView = await open(browser, lead, base);
  const L = leadView.page;
  await L.getByRole("link", { name: "요청사항", exact: true }).click();
  await expect(
    L.getByRole("heading", { name: "요청사항", exact: true }),
  ).toBeVisible();
  await L.getByRole("button", { name: "요청 등록", exact: true }).click();
  await L.getByLabel("제목", { exact: true }).fill("편집 파일 전달");
  await L.getByLabel("내용", { exact: true }).fill(
    "최종 승인 영상과 연결되는 작업 파일",
  );
  await L.getByLabel("확인 기준", { exact: true }).fill(
    "다른 장치에서 열어 작업 재개",
  );
  await L.getByLabel("파일 형식", { exact: true }).fill("wav");
  await L.getByLabel("완료에 필수", { exact: true }).check();
  const assignee = L.getByLabel("작업 담당", { exact: true });
  await expect(assignee.locator(`option[value="${external.id}"]`)).toHaveText(
    "req-external · 외부",
  );
  await assignee.selectOption(external.id);
  await lostReply(
    L,
    root,
    "create",
    `${root}/requests`,
    () => L.getByRole("button", { name: "요청 저장", exact: true }).click(),
    async () => {
      await L.getByRole("button", { name: "로그아웃", exact: true }).click();
      await loginOnPage(L, external, `${base}/requests`);
      await expect(
        L.getByRole("heading", { name: "요청사항", exact: true }),
      ).toBeVisible();
      await expect(
        L.getByText("응답을 확인하지 못한 요청 변경이 있습니다.", {
          exact: false,
        }),
      ).toHaveCount(0);
      await expect(
        L.getByRole("link", { name: "확인한 요청 열기", exact: true }),
      ).toHaveCount(0);
      await L.getByRole("button", { name: "로그아웃", exact: true }).click();
      await loginOnPage(L, lead, `${base}/requests`);
      await expect(
        L.getByText("응답을 확인하지 못한 요청 변경이 있습니다.", {
          exact: false,
        }),
      ).toBeVisible();
    },
  );
  await L.getByRole("link", { name: "확인한 요청 열기", exact: true }).click();
  await expect(
    L.getByRole("heading", { name: "편집 파일 전달", exact: true }),
  ).toBeVisible();
  const requestId = L.url().split("/").at(-1)!;
  expect(
    (
      await request.get(`${root}/requests?unknown=true`, {
        headers: lead.headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get(`${root}/requests`, {
        headers: { ...lead.headers, "X-Prepix-Account-ID": external.id },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(`${root}/requests/not-a-uuid`, {
        headers: lead.headers,
      })
    ).status(),
  ).toBe(400);

  // External producer uploads a real file, then submits that exact version.
  const externalView = await open(browser, external, `${base}/files`);
  const X = externalView.page;
  await expect(
    X.getByRole("heading", { name: "폴더 자료", exact: true }),
  ).toBeVisible();
  await X.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name: "edit.wav",
    mimeType: "audio/wav",
    buffer: wav(64 * 1024),
  });
  await X.getByRole("button", { name: "팀에 보관 시작", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${root}/files`, { headers: external.headers })
          ).json()
        ).data.versions.length,
      { timeout: 60_000 },
    )
    .toBe(1);
  await X.goto(`${base}/requests/${requestId}`);
  await expect(
    X.getByRole("heading", { name: "편집 파일 전달", exact: true }),
  ).toBeVisible();
  await X.getByRole("checkbox", { name: /edit\.wav/ }).check();
  await X.getByLabel("제출 메모", { exact: true }).fill("1차 작업 파일");
  await lostReply(
    X,
    root,
    "submit",
    `${root}/requests/${requestId}/submissions`,
    () => X.getByRole("button", { name: "제출", exact: true }).click(),
  );
  await expect(X.getByText("제출 1차", { exact: false })).toBeVisible();
  const afterRetry = (
    await (
      await request.get(`${root}/requests/${requestId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data;
  expect(afterRetry.submissions).toHaveLength(1);
  expect(afterRetry.request.state).toBe("submitted");
  expect(afterRetry.submissions[0].files[0].name).toBe("edit.wav");
  await expect(
    X.getByRole("button", { name: "확인 완료", exact: true }),
  ).toHaveCount(0);

  // The lead is the designated confirmer and the steward of external uploads.
  await L.reload();
  await expect(
    L.locator("ol ul").getByText(/edit\.wav · 버전 1/),
  ).toBeVisible();
  const submissionId = afterRetry.submissions[0].id;
  await lostReply(
    L,
    root,
    "decide",
    `${root}/requests/${requestId}/submissions/${submissionId}/confirmations`,
    () => L.getByRole("button", { name: "확인 완료", exact: true }).click(),
  );
  await expect(
    L.getByText("확인 완료 · 현재 유효", { exact: false }),
  ).toBeVisible();

  // A team member outside the project cannot learn the request exists.
  const memberView = await open(
    browser,
    member,
    `${base}/requests/${requestId}`,
  );
  await expect(memberView.page.locator("main [role=alert]")).toContainText(
    "폴더를 찾을 수 없거나",
  );
  await expect(memberView.page.getByText("편집 파일 전달")).toHaveCount(0);

  // Due date changes keep the confirmation; criteria changes require it again.
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByLabel("기한 (한국 시간)", { exact: true }).fill(
    "2026-10-30T18:00",
  );
  await lostReply(L, root, "update", `${root}/requests/${requestId}`, () =>
    L.getByRole("button", { name: "변경 저장", exact: true }).click(),
  );
  await expect(
    L.getByRole("button", { name: "변경 저장", exact: true }),
  ).toHaveCount(0);
  await expect(L.getByText("2026. 10. 30.", { exact: false })).toBeVisible();
  await expect(
    L.getByText("확인 완료 · 현재 유효", { exact: false }),
  ).toBeVisible();
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByLabel("확인 기준", { exact: true }).fill(
    "다른 장치에서 열고 승인 영상과 동일한지 확인",
  );
  await expect(
    L.getByText("새 요청 버전이 만들어지고", { exact: false }),
  ).toBeVisible();
  await L.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(
    L.getByText("이전 확인 · 기준 변경 또는 새 제출로 재확인 필요", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    L.getByText("요청 버전 2", { exact: false }).first(),
  ).toBeVisible();

  // A reviewer only sees shared or own requests and can only propose.
  const reviewerView = await open(browser, reviewer, `${base}/requests`);
  const R = reviewerView.page;
  await expect(
    R.getByRole("heading", { name: "요청사항", exact: true }),
  ).toBeVisible();
  await expect(R.getByText("편집 파일 전달")).toHaveCount(0);
  await R.getByRole("button", { name: "제안 등록", exact: true }).click();
  await expect(R.getByLabel("확인 기준", { exact: true })).toHaveCount(0);
  await R.getByLabel("제목", { exact: true }).fill("세로 버전 추가");
  await R.getByLabel("내용", { exact: true }).fill(
    "숏폼용 세로 편집본이 필요합니다",
  );
  await R.getByRole("button", { name: "제안 보내기", exact: true }).click();
  await expect(
    R.getByRole("heading", { name: "세로 버전 추가", exact: true }),
  ).toBeVisible();
  await expect(R.getByText("접수 대기", { exact: true })).toBeVisible();
  const proposalUrl = R.url();

  // The lead declines the proposal and waives the required request, with reasons.
  await L.goto(proposalUrl);
  await L.getByLabel("반려 사유", { exact: true }).fill("이번 계약 범위 밖");
  await L.getByRole("button", { name: "반려", exact: true }).click();
  await expect(
    L.getByText("사유: 이번 계약 범위 밖", { exact: false }),
  ).toBeVisible();
  await L.goto(`${base}/requests/${requestId}`);
  await L.getByLabel("면제 사유", { exact: true }).fill(
    "고객이 작업 파일 전달을 철회",
  );
  await lostReply(L, root, "close", `${root}/requests/${requestId}/close`, () =>
    L.getByRole("button", { name: "면제", exact: true }).click(),
  );
  await expect(
    L.getByText("사유: 고객이 작업 파일 전달을 철회", { exact: false }),
  ).toBeVisible();
  await L.goto(`${base}/requests`);
  await expect(
    L.getByText("필수 요청 1건 중 1건 확인·면제", { exact: false }),
  ).toBeVisible();
  await L.goto(proposalUrl);
  await L.getByLabel("다시 열기 사유", { exact: true }).fill(
    "추가 작업 범위를 합의함",
  );
  await lostReply(
    L,
    root,
    "reopen",
    `${root}/requests/${proposalUrl.split("/").at(-1)}/reopen`,
    () => L.getByRole("button", { name: "다시 열기", exact: true }).click(),
  );
  await L.getByRole("button", { name: "접수하기", exact: true }).click();
  await L.getByLabel("확인 기준", { exact: true }).fill(
    "세로 비율과 자막 확인",
  );
  await lostReply(
    L,
    root,
    "accept",
    `${root}/requests/${proposalUrl.split("/").at(-1)}/accept`,
    () => L.getByRole("button", { name: "접수", exact: true }).click(),
  );
  const accepted = (
    await (
      await request.get(`${root}/requests/${proposalUrl.split("/").at(-1)}`, {
        headers: lead.headers,
      })
    ).json()
  ).data;
  expect(accepted.request.state).toBe("open");
  expect(accepted.revisions).toHaveLength(2);
  const confirmation = (
    await (
      await request.get(`${root}/requests/${requestId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data;
  expect(confirmation.submissions).toHaveLength(1);
  expect(confirmation.submissions[0].confirmation).toBeTruthy();
  const pagedProjectResponse = await request.post(
    `${api}/v2/workspaces/${team}/b2b/projects`,
    {
      headers: lead.headers,
      data: { requestKey: randomUUID(), name: "요청 페이지 검증" },
    },
  );
  expect(pagedProjectResponse.status()).toBe(201);
  const pagedProject = (await pagedProjectResponse.json()).data.project.id;
  const pagedRoot = `${api}/v2/workspaces/${team}/b2b/projects/${pagedProject}/requests`;
  for (let i = 0; i < 22; i++) {
    const response = await request.post(pagedRoot, {
      headers: lead.headers,
      data: {
        requestKey: randomUUID(),
        title: `페이지 요청 ${i}`,
        body: "전체 범위의 집계",
        criteria: "완료 확인",
        required: true,
        confirmerId: lead.id,
        assigneeId: lead.id,
      },
    });
    expect(response.status()).toBe(201);
    if (i < 3) {
      const made = (await response.json()).data.request;
      expect(
        (
          await request.post(`${pagedRoot}/${made.id}/close`, {
            headers: lead.headers,
            data: {
              requestKey: randomUUID(),
              revision: made.revision,
              reason: "합의된 면제",
            },
          })
        ).status(),
      ).toBe(201);
    }
  }
  await L.goto(
    `/dashboard/workspaces/${team}/projects/${pagedProject}/requests`,
  );
  await expect(
    L.getByText("필수 요청 22건 중 3건 확인·면제", { exact: false }),
  ).toBeVisible();
  await expect(L.getByRole("link", { name: /^페이지 요청 / })).toHaveCount(20);
  await L.getByRole("button", { name: "다음 요청", exact: true }).click();
  await expect(L.getByRole("link", { name: /^페이지 요청 / })).toHaveCount(2);
  await expect(
    L.getByText("필수 요청 22건 중 3건 확인·면제", { exact: false }),
  ).toBeVisible();
  await L.getByRole("button", { name: "완료", exact: true }).click();
  await expect(L.getByRole("link", { name: /^페이지 요청 / })).toHaveCount(3);
  await expect(
    L.getByText("필수 요청 22건 중 3건 확인·면제", { exact: false }),
  ).toBeVisible();
  await L.setViewportSize({ width: 390, height: 844 });
  await L.goto(`${base}/requests/${requestId}`);
  await expect(
    L.getByRole("heading", { name: "편집 파일 전달", exact: true }),
  ).toBeVisible();
  await L.screenshot({
    path: process.env.B2B_E2E_SCREENSHOT ?? "/tmp/prepix-request-mobile.png",
    fullPage: true,
  });
  // Request references are exact versions, optional and independent of a delivery.
  await L.goto(`${base}/requests`);
  await L.getByRole("button", { name: "요청 등록", exact: true }).click();
  await L.getByLabel("제목", { exact: true }).fill("참고 기준 영상");
  await L.getByLabel("내용", { exact: true }).fill(
    "첨부는 비교용이며 제출을 대신하지 않음",
  );
  await L.getByRole("checkbox", { name: /참고 첨부 edit\.wav/ }).check();
  await L.getByRole("checkbox", {
    name: "검토자와 외부 참여자 모두에게 공개",
    exact: true,
  }).check();
  await L.getByRole("button", { name: "요청 저장", exact: true }).click();
  await expect(
    L.getByRole("heading", { name: "참고 기준 영상", exact: true }),
  ).toBeVisible();
  const referenceRequestId = L.url().split("/").at(-1)!;
  const referenceResponse = (
    await (
      await request.get(`${root}/requests/${referenceRequestId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data;
  expect(referenceResponse.request.state).toBe("open");
  expect(referenceResponse.submissions).toHaveLength(0);
  expect(referenceResponse.revisions[0].references[0].versionId).toBe(
    afterRetry.submissions[0].files[0].versionId,
  );
  const referenceFile = referenceResponse.revisions[0].references[0];
  const versionResponse = (
    await (
      await request.get(`${root}/files/${referenceFile.versionId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data.version;
  if (!versionResponse.allowedActions.download) {
    expect(
      (
        await request.post(
          `${root}/assets/${referenceFile.assetId}/permissions`,
          {
            headers: lead.headers,
            data: {
              requestKey: randomUUID(),
              revision: versionResponse.permissionRevision,
              userId: lead.id,
              canDownload: true,
              canUseForAi: false,
              reason: "Local verified reference receipt",
            },
          },
        )
      ).status(),
    ).toBe(201);
    await L.reload();
  }
  const downloading = L.waitForEvent("download");
  await L.getByRole("button", {
    name: "참고 자료 원본 받기",
    exact: true,
  }).click();
  const downloaded = await downloading;
  const receiptPath = `/tmp/prepix-reference-receipt-${randomUUID()}.wav`;
  await downloaded.saveAs(receiptPath);
  expect(
    createHash("sha256")
      .update(await readFile(receiptPath))
      .digest("hex"),
  ).toBe(referenceFile.sha256);
  await L.screenshot({
    path: "/tmp/prepix-request-references-mobile.png",
    fullPage: true,
  });
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByRole("button", { name: "참고 첨부 변경", exact: true }).click();
  await L.getByRole("button", {
    name: "참고 첨부 모두 해제",
    exact: true,
  }).click();
  await lostReply(
    L,
    root,
    "update",
    `${root}/requests/${referenceRequestId}`,
    () => L.getByRole("button", { name: "변경 저장", exact: true }).click(),
  );
  const referenceRemoved = (
    await (
      await request.get(`${root}/requests/${referenceRequestId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data;
  expect(referenceRemoved.revisions).toHaveLength(2);
  expect(referenceRemoved.revisions[1].references).toEqual([]);
  expect(referenceRemoved.revisions[0].references[0].versionId).toBe(
    referenceFile.versionId,
  );
  await expect(
    L.getByText("참고 첨부가 없습니다.", { exact: true }),
  ).toBeVisible();
  const permissions = (
    await (
      await request.get(`${root}/assets/${referenceFile.assetId}/permissions`, {
        headers: lead.headers,
      })
    ).json()
  ).data.permissions;
  const externalGrant = permissions.find(
    (p: { userId: string }) => p.userId === external.id,
  );
  expect(
    (
      await request.post(
        `${root}/assets/${referenceFile.assetId}/permissions`,
        {
          headers: lead.headers,
          data: {
            requestKey: randomUUID(),
            revision: externalGrant.revision,
            userId: external.id,
            canDownload: false,
            canUseForAi: false,
            remove: true,
            reason: "Current reference access revoked",
          },
        },
      )
    ).status(),
  ).toBe(201);
  await X.goto(`${base}/requests/${referenceRequestId}`);
  await expect(
    X.getByRole("heading", { name: "참고 기준 영상", exact: true }),
  ).toBeVisible();
  await X.getByText("요청 변경 이력 2건", { exact: true }).click();
  await expect(
    X.getByText("접근 제한된 참고 자료", { exact: true }),
  ).toBeVisible();
  await expect(X.getByText(/edit\.wav/)).toHaveCount(0);
  expect(
    (
      await (
        await request.get(`${root}/requests/${referenceRequestId}`, {
          headers: external.headers,
        })
      ).json()
    ).data.revisions[0].references,
  ).toEqual([{ position: 0, access: "restricted" }]);
  // Current completion evidence follows the exact project link, not this
  // viewer's grants. Its historical confirmation and deletion hold remain.
  const evidenceCreated = await request.post(`${root}/requests`, {
    headers: lead.headers,
    data: {
      requestKey: randomUUID(),
      title: "근거 전달 확인",
      body: "정확한 버전이 프로젝트에 남아 있어야 함",
      required: true,
      criteria: "정확한 원본",
      shared: true,
      confirmerId: lead.id,
    },
  });
  expect(evidenceCreated.status()).toBe(201);
  const evidenceId = (await evidenceCreated.json()).data.request.id;
  const evidenceSubmitted = await request.post(
    `${root}/requests/${evidenceId}/submissions`,
    {
      headers: lead.headers,
      data: {
        requestKey: randomUUID(),
        requestRevision: 1,
        versionIds: [referenceFile.versionId],
        note: "",
      },
    },
  );
  expect(evidenceSubmitted.status()).toBe(201);
  const evidenceSubmissionId = (await evidenceSubmitted.json()).data
    .submissionId;
  expect(
    (
      await request.post(
        `${root}/requests/${evidenceId}/submissions/${evidenceSubmissionId}/confirmations`,
        {
          headers: lead.headers,
          data: { requestKey: randomUUID(), decision: "confirmed", note: "" },
        },
      )
    ).status(),
  ).toBe(201);
  const evidenceRead = async (headers = lead.headers) =>
    (
      await (
        await request.get(`${root}/requests/${evidenceId}`, { headers })
      ).json()
    ).data;
  const privateEvidence = await evidenceRead(external.headers);
  expect(privateEvidence.submissions[0].files).toEqual([
    { position: 0, access: "restricted" },
  ]);
  expect(privateEvidence.request.evidenceMissing).toBe(false);
  expect(privateEvidence.submissions[0].confirmation.current).toBe(true);
  const progress = async () =>
    (
      await (
        await request.get(`${root}/request-work`, { headers: lead.headers })
      ).json()
    ).data.required.satisfied;
  const satisfiedBefore = await progress();
  const linkedFile = (
    await (
      await request.get(`${root}/files/${referenceFile.versionId}`, {
        headers: lead.headers,
      })
    ).json()
  ).data.version;
  expect(
    (
      await request.post(`${root}/files/${referenceFile.versionId}/unlink`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          revision: linkedFile.referenceRevision,
          reason: "근거 연결 제외 인수",
        },
      })
    ).status(),
  ).toBe(201);
  const unavailableEvidence = await evidenceRead();
  expect(unavailableEvidence.request.state).toBe("confirmed");
  expect(unavailableEvidence.request.evidenceMissing).toBe(true);
  expect(unavailableEvidence.submissions[0].confirmation.current).toBe(false);
  expect(await progress()).toBe(satisfiedBefore - 1);
  await L.goto(`${base}/requests/${evidenceId}`);
  await expect(
    L.getByText("확인 이력은 보존되어 있지만", { exact: false }),
  ).toBeVisible();
  await expect(
    L.getByText("이전 확인 · 현재 완료 근거로 사용되지 않음", { exact: false }),
  ).toBeVisible();
  await L.screenshot({
    path: "/tmp/prepix-request-evidence-mobile.png",
    fullPage: true,
  });
  await L.goto(`${base}/requests`);
  await expect(
    L.getByText("제출 근거 사용 불가 · 완료 조건 미충족", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await request.post(`${root}/files/link`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          versionId: referenceFile.versionId,
          fromLibrary: true,
          sourceProjectId: project,
        },
      })
    ).status(),
  ).toBe(201);
  const restoredEvidence = await evidenceRead();
  expect(restoredEvidence.request.evidenceMissing).toBe(false);
  expect(restoredEvidence.submissions[0].confirmation.current).toBe(true);
  expect(restoredEvidence.submissions[0].confirmation.id).toBe(
    unavailableEvidence.submissions[0].confirmation.id,
  );
  expect(await progress()).toBe(satisfiedBefore);
  await L.goto(`${base}/requests/${evidenceId}`);
  await expect(
    L.getByText("확인 완료 · 현재 유효", { exact: false }),
  ).toBeVisible();
  await expect(
    L.getByText("확인 이력은 보존되어 있지만", { exact: false }),
  ).toHaveCount(0);
  for (const view of [leadView, externalView, memberView, reviewerView]) {
    expect(view.errors).toEqual([]);
    await view.close();
  }
});

test("F03 request work on team home and project overview: live counts, paging, failures and revoked participation", async ({
  browser,
  request,
}) => {
  test.setTimeout(180000);
  const lead = await account(request, "work-lead");
  const external = await account(request, "work-external");
  const reviewer = await account(request, "work-reviewer");
  const member = await account(request, "work-member");
  const madeTeam = await request.post(`${api}/v2/workspaces`, {
    headers: lead.headers,
    data: { requestKey: randomUUID(), name: "업무 집계 인수" },
  });
  expect(madeTeam.status()).toBe(201);
  const team = (await madeTeam.json()).data.workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  fixture("b2b-test-fixture.cjs", {
    workspaceId: team,
    action: "join",
    userId: member.id,
  });
  const teamApi = `${api}/v2/workspaces/${team}/b2b`;
  const madeProject = await request.post(`${teamApi}/projects`, {
    headers: lead.headers,
    data: { requestKey: randomUUID(), name: "초대된 영상 프로젝트" },
  });
  expect(madeProject.status()).toBe(201);
  const project = (await madeProject.json()).data.project.id as string;
  await invite(request, lead, team, project, external, "external", "producer");
  await invite(request, lead, team, project, reviewer, "internal", "reviewer");
  const root = `${teamApi}/projects/${project}`;
  const home = `/dashboard/workspaces/${team}`;
  const overview = `${home}/projects/${project}`;
  const fields = {
    body: "등록된 기준",
    criteria: "결과를 확인",
    required: true,
    assigneeId: external.id,
    confirmerId: lead.id,
    shared: false,
  };
  const assigned: { id: string; title: string; revision: number }[] = [];
  for (let i = 0; i < 25; i++) {
    const title = `내 담당 영상 ${String(i).padStart(2, "0")}`;
    const response = await request.post(`${root}/requests`, {
      headers: lead.headers,
      data: {
        ...fields,
        title,
        requestKey: randomUUID(),
        ...(i === 0
          ? { dueAt: new Date(Date.now() - 60000).toISOString() }
          : {}),
      },
    });
    expect(response.status()).toBe(201);
    assigned.push({ ...(await response.json()).data.request, title });
  }
  const privateRequest = await request.post(`${root}/requests`, {
    headers: lead.headers,
    data: {
      requestKey: randomUUID(),
      title: "비공개 내부 요청",
      body: "Secret",
      confirmerId: lead.id,
      assigneeId: lead.id,
    },
  });
  expect(privateRequest.status()).toBe(201);
  const pending = await request.post(`${root}/requests`, {
    headers: lead.headers,
    data: {
      requestKey: randomUUID(),
      title: "내 확인 대기 영상",
      body: "Check",
      confirmerId: lead.id,
      assigneeId: external.id,
    },
  });
  expect(pending.status()).toBe(201);
  const pendingId = (await pending.json()).data.request.id;
  expect(
    (
      await request.post(`${root}/requests/${pendingId}/submissions`, {
        headers: external.headers,
        data: {
          requestKey: randomUUID(),
          requestRevision: 1,
          versionIds: [],
          note: "제출했습니다",
        },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post(`${root}/requests`, {
        headers: reviewer.headers,
        data: {
          requestKey: randomUUID(),
          title: "검토자의 접수 제안",
          body: "Please consider",
        },
      })
    ).status(),
  ).toBe(201);
  for (const suffix of [
    "?unknown=true",
    "?view=done",
    `?search=${"x".repeat(101)}`,
  ])
    expect(
      (
        await request.get(`${teamApi}/request-work${suffix}`, {
          headers: lead.headers,
        })
      ).status(),
    ).toBe(400);
  expect(
    (
      await request.get(`${teamApi}/request-work`, {
        headers: { ...lead.headers, "X-Prepix-Account-ID": external.id },
      })
    ).status(),
  ).toBe(403);
  const memberHttp = await request.get(`${teamApi}/request-work`, {
    headers: member.headers,
  });
  expect(memberHttp.status()).toBe(200);
  expect(memberHttp.headers()["cache-control"]).toBe("private, no-store");
  const memberResponse = (await memberHttp.json()).data;
  expect(memberResponse.cards).toEqual([]);
  expect(memberResponse.required.total).toBe(0);
  expect(JSON.stringify(memberResponse)).not.toContain("초대된 영상 프로젝트");

  const leadView = await open(browser, lead, home);
  const L = leadView.page;
  const leadQueue = L.getByRole("region", {
    name: "내 요청 업무",
    exact: true,
  });
  await expect(
    leadQueue.getByRole("button", { name: "내 담당 요청 1", exact: true }),
  ).toBeVisible();
  await expect(
    leadQueue.getByRole("button", { name: "내 확인 대기 1", exact: true }),
  ).toBeVisible();
  await expect(
    leadQueue.getByRole("button", { name: "내 접수 대기 1", exact: true }),
  ).toBeVisible();
  await leadQueue
    .getByRole("button", { name: "내 확인 대기 1", exact: true })
    .click();
  await expect(
    leadQueue.getByRole("link", { name: /내 확인 대기 영상/ }),
  ).toBeVisible();
  await expect(
    leadQueue.getByRole("link", { name: /비공개 내부 요청/ }),
  ).toHaveCount(0);

  const externalView = await open(browser, external, home);
  const X = externalView.page;
  const queue = X.getByRole("region", { name: "내 요청 업무", exact: true });
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 25", exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByRole("button", { name: "기한 지난 업무 1", exact: true }),
  ).toBeVisible();
  await expect(queue.getByRole("listitem")).toHaveCount(20);
  await expect(
    queue.getByText("비공개 내부 요청", { exact: true }),
  ).toHaveCount(0);
  await queue.getByRole("button", { name: "다음 업무", exact: true }).click();
  await expect(queue.getByRole("listitem")).toHaveCount(5);
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 25", exact: true }),
  ).toBeVisible();
  await queue.getByRole("button", { name: "처음 페이지", exact: true }).click();
  await expect(queue.getByRole("listitem")).toHaveCount(20);
  await queue
    .getByLabel("요청 업무 검색", { exact: true })
    .fill("비공개 내부 요청");
  await queue.getByRole("button", { name: "검색", exact: true }).click();
  await expect(
    queue.getByText("검색 조건에 맞는 내 요청 업무가 없습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  await queue.getByLabel("요청 업무 검색", { exact: true }).fill("");
  await queue.getByRole("button", { name: "검색", exact: true }).click();
  await expect(queue.getByRole("listitem")).toHaveCount(20);

  const workRoute = `${teamApi}/request-work**`;
  let fail = true;
  await X.route(workRoute, async (route) => {
    if (fail) await route.abort();
    else await route.continue();
  });
  await queue
    .getByRole("button", { name: "업무 새로고침", exact: true })
    .click();
  await expect(queue.getByRole("alert")).toBeVisible();
  await expect(queue.getByRole("listitem")).toHaveCount(20);
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 25", exact: true }),
  ).toBeVisible();
  fail = false;
  await queue.getByRole("button", { name: "다시 확인", exact: true }).click();
  await expect(queue.getByRole("alert")).toHaveCount(0);
  await X.unroute(workRoute);

  // Same browser switches accounts: the team-only account cannot inherit cards.
  await X.getByRole("button", { name: "로그아웃", exact: true }).click();
  await loginOnPage(X, member, home);
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 0", exact: true }),
  ).toBeVisible();
  await expect(queue.getByRole("listitem")).toHaveCount(0);
  await X.getByRole("button", { name: "로그아웃", exact: true }).click();
  await loginOnPage(X, external, overview);
  // P (2026-10-07): a folder folds its request work under "더 보기".
  await X.locator("summary", { hasText: "더 보기" }).click();
  await expect(queue.getByTestId("required-request-progress")).toHaveText(
    "필수 요청 확인: 0 / 25",
  );
  await queue.getByRole("link", { name: /내 담당 영상 24/ }).click();
  await expect(
    X.getByRole("heading", { name: "내 담당 영상 24", exact: true }),
  ).toBeVisible();
  await X.goto(overview);
  // P (2026-10-07): a folder folds its request work under "더 보기".
  await X.locator("summary", { hasText: "더 보기" }).click();
  const reassigned = assigned[24];
  expect(
    (
      await request.post(`${root}/requests/${reassigned.id}`, {
        headers: lead.headers,
        data: {
          ...fields,
          title: reassigned.title,
          revision: reassigned.revision,
          assigneeId: lead.id,
          requestKey: randomUUID(),
        },
      })
    ).status(),
  ).toBe(201);
  await queue
    .getByRole("button", { name: "업무 새로고침", exact: true })
    .click();
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 24", exact: true }),
  ).toBeVisible();
  await expect(queue.getByTestId("required-request-progress")).toHaveText(
    "필수 요청 확인: 0 / 24",
  );
  await expect(
    queue.getByRole("link", { name: /내 담당 영상 24/ }),
  ).toHaveCount(0);

  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "expire" });
  await queue
    .getByRole("button", { name: "업무 새로고침", exact: true })
    .click();
  await expect(
    queue.getByText(
      "현재 열람 기간입니다. 요청을 볼 수 있지만 변경할 수 없습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(queue.getByText("요청 보기", { exact: true })).toHaveCount(20);
  await X.setViewportSize({ width: 390, height: 844 });
  await X.screenshot({
    path: "/tmp/prepix-request-work-mobile.png",
    fullPage: true,
  });
  expect(
    await X.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "activate" });

  // A formerly authorized response arrives after a newer denial. It must not
  // revive the project title, cards or totals after current participation ends.
  const projectWork = `${root}/request-work**`;
  let hold = true;
  let release!: () => void;
  let delivered!: () => void;
  let captured!: () => void;
  const ready = new Promise<void>((resolve) => {
    captured = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const landed = new Promise<void>((resolve) => {
    delivered = resolve;
  });
  await X.route(projectWork, async (route) => {
    if (hold) {
      hold = false;
      const response = await route.fetch();
      captured();
      await held;
      await route.fulfill({ response });
      delivered();
    } else await route.continue();
  });
  await queue
    .getByRole("button", { name: "업무 새로고침", exact: true })
    .click();
  await ready;
  const currentProject = (
    await (await request.get(root, { headers: lead.headers })).json()
  ).data;
  expect(
    (
      await request.post(`${root}/people`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          revision: currentProject.project.revision,
          userId: external.id,
          role: "producer",
          canDownload: false,
          remove: true,
          reason: "참여 종료",
        },
      })
    ).status(),
  ).toBe(201);
  await queue
    .getByRole("button", { name: "업무 새로고침", exact: true })
    .click();
  await expect(
    X.getByText("폴더를 찾을 수 없거나 접근 권한이 없습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  release();
  await landed;
  await X.unroute(projectWork);
  await expect(
    X.getByRole("heading", { name: "초대된 영상 프로젝트", exact: true }),
  ).toHaveCount(0);
  await expect(queue).toHaveCount(0);
  await X.goto(home);
  await expect(
    queue.getByRole("button", { name: "내 담당 요청 0", exact: true }),
  ).toBeVisible();
  await expect(queue.getByRole("listitem")).toHaveCount(0);
  for (const view of [leadView, externalView]) {
    expect(view.errors).toEqual([]);
    await view.close();
  }
});

test("F05/F13 reaccepted participation requires an explicit same-person reassignment and preserves confirmed history", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const lead = await account(request, "lifetime-lead");
  const external = await account(request, "lifetime-external");
  const confirmer = await account(request, "lifetime-confirmer");
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: lead.headers,
    data: {
      name: `참여 인수 ${randomUUID().slice(0, 8)}`,
      requestKey: randomUUID(),
    },
  });
  expect(created.status()).toBe(201);
  const team = (await created.json()).data.workspace.id;
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  fixture("b2b-test-fixture.cjs", {
    workspaceId: team,
    action: "join",
    userId: confirmer.id,
  });
  const made = await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, {
    headers: lead.headers,
    data: { requestKey: randomUUID(), name: "참여 회차 검증" },
  });
  expect(made.status()).toBe(201);
  const project = (await made.json()).data.project.id;
  const root = `${api}/v2/workspaces/${team}/b2b/projects/${project}`;
  const base = `/dashboard/workspaces/${team}/projects/${project}`;
  await invite(request, lead, team, project, external, "external", "producer");
  await invite(request, lead, team, project, confirmer, "internal", "producer");
  const input = {
    requestKey: randomUUID(),
    title: "재초대 업무",
    body: "참여 종료 뒤 재지정",
    required: true,
    criteria: "검증한 결과",
    confirmerId: confirmer.id,
    assigneeId: external.id,
  };
  const task = await request.post(`${root}/requests`, {
    headers: lead.headers,
    data: input,
  });
  expect(task.status()).toBe(201);
  const id = (await task.json()).data.request.id;
  expect(
    (
      await request.post(`${root}/requests`, {
        headers: external.headers,
        data: {
          requestKey: randomUUID(),
          title: "이전 비공개 제안",
          body: "작성 기록 보존",
        },
      })
    ).status(),
  ).toBe(201);
  const change = async (user: Account, remove: boolean, role = "producer") => {
    const current = (
      await (await request.get(root, { headers: lead.headers })).json()
    ).data;
    expect(
      (
        await request.post(`${root}/people`, {
          headers: lead.headers,
          data: {
            requestKey: randomUUID(),
            revision: current.project.revision,
            userId: user.id,
            role,
            canDownload: true,
            remove,
            reason: "참여 인수",
          },
        })
      ).status(),
    ).toBe(201);
  };
  const read = async () =>
    (
      await (
        await request.get(`${root}/requests/${id}`, { headers: lead.headers })
      ).json()
    ).data;
  await change(external, false, "reviewer");
  expect((await read()).request.assignmentCurrent.assignee).toBe(true);
  await change(external, false);
  const leadView = await open(browser, lead, `${base}/requests/${id}`);
  const externalView = await open(browser, external, `${base}/requests`);
  const L = leadView.page,
    X = externalView.page;
  await expect(
    X.getByRole("link", { name: "재초대 업무", exact: true }),
  ).toBeVisible();
  await change(external, true);
  await change(confirmer, true);
  await invite(request, lead, team, project, external, "external", "producer");
  await invite(request, lead, team, project, confirmer, "internal", "producer");
  await X.reload();
  await expect(
    X.getByText("표시할 요청이 없습니다.", { exact: true }),
  ).toBeVisible();
  await expect(
    X.getByRole("link", { name: "재초대 업무", exact: true }),
  ).toHaveCount(0);
  await expect(
    X.getByRole("link", { name: "이전 비공개 제안", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.get(`${root}/requests/${id}`, { headers: external.headers })
    ).status(),
  ).toBe(404);
  await L.reload();
  await expect(
    L.getByText("lifetime-external · 재지정 필요", { exact: true }),
  ).toBeVisible();
  await expect(
    L.getByText("lifetime-confirmer · 재지정 필요", { exact: true }),
  ).toBeVisible();
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByLabel("제목", { exact: true }).fill("재초대 업무 수정");
  await L.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect(
    L.getByRole("heading", { name: "재초대 업무 수정", exact: true }),
  ).toBeVisible();
  expect((await read()).request.assignmentCurrent).toEqual({
    assignee: false,
    confirmer: false,
  });
  expect(
    (
      await request.get(`${root}/requests/${id}`, { headers: external.headers })
    ).status(),
  ).toBe(404);
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByLabel("작업 담당을 현재 참여에 다시 지정", {
    exact: true,
  }).check();
  await L.getByLabel("확인자를 현재 참여에 다시 지정", { exact: true }).check();
  await lostReply(L, root, "update", `${root}/requests/${id}`, () =>
    L.getByRole("button", { name: "변경 저장", exact: true }).click(),
  );
  expect((await read()).request.assignmentCurrent).toEqual({
    assignee: true,
    confirmer: true,
  });
  expect((await read()).request.requestRevision).toBe(1);
  await X.reload();
  await expect(
    X.getByRole("link", { name: "재초대 업무 수정", exact: true }),
  ).toBeVisible();
  const submitted = await request.post(`${root}/requests/${id}/submissions`, {
    headers: external.headers,
    data: {
      requestKey: randomUUID(),
      requestRevision: 1,
      versionIds: [],
      note: "완료한 작업",
    },
  });
  expect(submitted.status()).toBe(201);
  const submissionId = (await submitted.json()).data.submissionId;
  await change(confirmer, true);
  await invite(request, lead, team, project, confirmer, "internal", "producer");
  const confirmerView = await open(
    browser,
    confirmer,
    `${base}/requests/${id}`,
  );
  const C = confirmerView.page;
  await expect(
    C.getByRole("heading", { name: "재초대 업무 수정", exact: true }),
  ).toBeVisible();
  await expect(
    C.getByRole("button", { name: "확인 완료", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.post(
        `${root}/requests/${id}/submissions/${submissionId}/confirmations`,
        {
          headers: confirmer.headers,
          data: {
            requestKey: randomUUID(),
            decision: "confirmed",
            note: "이전 지정으로 확인",
          },
        },
      )
    ).status(),
  ).toBe(403);
  await L.reload();
  await L.getByRole("button", { name: "요청 변경", exact: true }).click();
  await L.getByLabel("확인자를 현재 참여에 다시 지정", { exact: true }).check();
  await L.getByRole("button", { name: "변경 저장", exact: true }).click();
  await expect
    .poll(async () => (await read()).request.assignmentCurrent.confirmer)
    .toBe(true);
  await C.reload();
  await C.getByRole("button", { name: "확인 완료", exact: true }).click();
  await expect.poll(async () => (await read()).request.state).toBe("confirmed");
  const confirmationId = (await read()).submissions[0].confirmation.id;
  await change(confirmer, true);
  await invite(request, lead, team, project, confirmer, "internal", "producer");
  const historical = await read();
  expect(historical.submissions[0].confirmation.id).toBe(confirmationId);
  expect(historical.submissions[0].confirmation.current).toBe(true);
  expect(historical.request.assignmentCurrent.confirmer).toBe(false);
  expect(
    (
      await (
        await request.get(`${root}/request-work`, { headers: lead.headers })
      ).json()
    ).data.required,
  ).toEqual({ total: 1, satisfied: 1 });
  await L.reload();
  await L.setViewportSize({ width: 390, height: 844 });
  await L.screenshot({
    path: "/tmp/prepix-request-lifetime-mobile.png",
    fullPage: true,
  });
  expect(
    await L.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  for (const view of [leadView, externalView, confirmerView]) {
    expect(view.errors).toEqual([]);
    await view.close();
  }
});
