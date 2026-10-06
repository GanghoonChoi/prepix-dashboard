import { test, expect, type APIRequestContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3312";
const password = "LocalPreview123";
function fixture(script: string, input: object) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve(process.env.B2B_E2E_FIXTURE_DIR ?? "../prepix-backend/backend/scripts", script),
        JSON.stringify(input),
      ],
      { encoding: "utf8", timeout: 15000 },
    ),
  );
}
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
  let message: { verifyUrl: string } | undefined;
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${api}/__test/mail`)).json();
      message = mailbox.findLast(
        (m: { to: string; verifyUrl?: string }) =>
          m.to === email && m.verifyUrl,
      );
      return message?.verifyUrl;
    })
    .toBeTruthy();
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/confirm`, {
        data: { token: new URL(message!.verifyUrl).searchParams.get("token") },
      })
    ).status(),
  ).toBe(200);
  return { email, headers, id: session.user.id as string };
}
test("team usage, original failure returns, lost cancellation response, review-needed balance and current project privacy", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const owner = await account(request, "ai-owner"),
    user = await account(request, "ai-producer");
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name: "팀 AI 사용 검증", requestKey: randomUUID() },
  });
  expect(created.status()).toBe(201);
  const team = (await created.json()).data.workspace;
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`,
    target = `/dashboard/workspaces/${team.id}/ai`;
  const { periodId } = fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team.id,
    action: "purchase",
    target: "initial",
  });
  const projectReply = await request.post(`${endpoint}/projects`, {
    headers: owner.headers,
    data: { requestKey: randomUUID(), name: "현재 권한을 확인할 프로젝트" },
  });
  expect(projectReply.status()).toBe(201);
  const project = (await projectReply.json()).data.project;
  expect(
    (
      await request.post(`${endpoint}/invitations`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          email: user.email,
          kind: "internal",
          teamRole: "editor",
          projectId: project.id,
          projectRole: "producer",
          canDownload: false,
        },
      })
    ).status(),
  ).toBe(201);
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(
      async () => {
        const mailbox = await (await request.get(`${api}/__test/mail`)).json();
        offer = mailbox.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === user.email && m.inviteUrl?.includes("/b2b-invitations/"),
        );
        return offer?.inviteUrl;
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  const inviteToken = new URL(offer!.inviteUrl).pathname.split("/").at(-1);
  expect(
    (
      await request.post(`${api}/v2/b2b/invitations/${inviteToken}/accept`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await request.post(`${endpoint}/licences/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId,
          userId: user.id,
          limitUnits: 1000,
        },
      })
    ).status(),
  ).toBe(201);
  const input = {
    workspaceId: team.id,
    projectId: project.id,
    userId: user.id,
    maximumUnits: 20,
    confirmedUnits: 0,
  };
  const queued = fixture("b2b-ai-test-fixture.cjs", {
    ...input,
    state: "queued",
  });
  fixture("b2b-ai-test-fixture.cjs", { ...input, state: "failed" });
  fixture("b2b-ai-test-fixture.cjs", {
    ...input,
    state: "completed",
    confirmedUnits: 10,
  });
  expect(
    (
      await (
        await request.get(`${endpoint}/ai/jobs`, { headers: owner.headers })
      ).json()
    ).data.jobs,
  ).toEqual([]);
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target));
  await expect(
    page.getByRole("heading", { name: "팀 AI 사용량", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "팀 AI 사용량", exact: true }),
  ).toBeVisible();
  const summary = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "팀 공동 사용량", exact: true }),
    });
  await expect(summary.getByText("30", { exact: true })).toBeVisible();
  await expect(summary.getByText("10", { exact: true })).toBeVisible();
  await expect(
    page.getByText("실패 · 예약 반환", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("970", { exact: true })).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.screenshot({
    path: "/tmp/prepix-team-ai-usage-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/prepix-team-ai-usage-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1360, height: 1100 });
  const cancellationKeys: string[] = [];
  const cancellationPath = `**/projects/${project.id}/ai/jobs/${queued.jobId}/cancel`;
  await page.route(cancellationPath, async (route) => {
    cancellationKeys.push(route.request().postDataJSON().requestKey);
    const response = await route.fetch();
    if (cancellationKeys.length === 1) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "작업 취소", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "AI 작업 취소 확인" });
  await dialog.getByRole("button", { name: "취소 요청", exact: true }).click();
  await expect(
    dialog.getByText(/취소 결과를 아직 확인하지 못했습니다/),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "같은 취소 다시 확인", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(cancellationKeys).toHaveLength(2);
  expect(cancellationKeys[0]).toBe(cancellationKeys[1]);
  await expect(summary.getByText("50", { exact: true })).toBeVisible();
  const cancelled = (
    await (
      await request.get(
        `${endpoint}/projects/${project.id}/ai/jobs/${queued.jobId}`,
        { headers: user.headers },
      )
    ).json()
  ).data;
  expect(cancelled).toMatchObject({
    state: "cancelled",
    reservedUnits: 0,
    confirmedUnits: 0,
    returnedUnits: 20,
  });
  // The server mismatch behavior is verified on PostgreSQL. This response override
  // checks the frontend's null/review rendering without corrupting a paid fixture.
  await page.route(`**/workspaces/${team.id}/b2b/ai/usage`, async (route) => {
    const response = await route.fetch(),
      envelope = await response.json();
    await route.fulfill({
      response,
      json: {
        ...envelope,
        data: { ...envelope.data, reconciled: false, availableUnits: null },
      },
    });
  });
  await page
    .getByRole("button", { name: "최신 상태 확인", exact: true })
    .click();
  await expect(summary.getByText("확인 필요", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "사용량 기록을 확인하고 있습니다" }),
  ).toBeVisible();
  await page.unroute(`**/workspaces/${team.id}/b2b/ai/usage`);
  const current = (
    await (
      await request.get(`${endpoint}/projects/${project.id}`, {
        headers: owner.headers,
      })
    ).json()
  ).data.project;
  expect(
    (
      await request.post(`${endpoint}/projects/${project.id}/people`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          revision: current.revision,
          userId: user.id,
          role: "producer",
          canDownload: false,
          remove: true,
          reason: "Local privacy acceptance",
        },
      })
    ).status(),
  ).toBe(201);
  await page
    .getByRole("button", { name: "최신 상태 확인", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(page.getByText(project.name, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("표시할 AI 작업이 없습니다.", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(`${endpoint}/ai/jobs`, { headers: user.headers })
      ).json()
    ).data.jobs,
  ).toEqual([]);
});
