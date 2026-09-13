import { test, expect, type Page } from "@playwright/test";

// Run against scripts/workspaces-preview.cjs in prepix-backend only. It uses a
// dedicated local DB and captures mail; no production email/payment is involved.
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";
async function login(page: Page, email: string) {
  await expect(
    page.getByRole("heading", { name: "로그인", exact: true })
  ).toBeVisible();
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}

test("team creation, per-address invitation recovery, authenticated acceptance, mobile and old-server fallback", async ({
  page,
  browser,
  request,
}, testInfo) => {
  const suffix = Date.now();
  const ownerEmail = `owner-${suffix}@example.test`;
  const memberEmail = `member-${suffix}@example.test`;
  const failEmail = `fail-${suffix}@example.test`;
  for (const email of [ownerEmail, memberEmail]) {
    const response = await request.post(`${api}/v2/auth/register`, {
      data: { email, password, username: email.split("@")[0] },
    });
    expect(response.status()).toBe(201);
  }
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto("/dashboard/workspaces?locale=ko");
  await expect(page).toHaveURL(/\/login\?/);
  // Switching between login and signup must preserve the exact team destination.
  const signup = page.getByRole("link", { name: "계정 만들기", exact: true });
  await expect(signup).toHaveAttribute("href", /returnTo=/);
  await login(page, ownerEmail);
  await expect(
    page.getByRole("heading", { name: "팀이 함께하는 작업 공간" })
  ).toBeVisible();
  await page
    .getByRole("link", { name: "워크스페이스 만들기", exact: true })
    .click();
  await page
    .getByLabel("워크스페이스 이름", { exact: true })
    .fill("Studio onboarding");
  await expect(
    page.getByText(/워크스페이스를 만들어도 결제되지 않습니다/)
  ).toBeVisible();
  await page
    .getByRole("button", { name: "워크스페이스 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "함께할 팀원을 초대하세요" })
  ).toBeVisible();
  const workspaceUrl = page.url();
  const workspaceId = workspaceUrl.split("/").at(-1)!;
  // A transport failure leaves the form retryable with its exact draft intact.
  const inviteEndpoint = `${api}/v2/workspaces/${workspaceId}/invitations`;
  await page
    .getByLabel("이메일 주소", { exact: true })
    .fill(
      `${memberEmail}, ${failEmail}, ${memberEmail.toUpperCase()}, invalid`
    );
  await expect(page.getByText("invalid · 올바르지 않은 이메일")).toBeVisible();
  await page.route(inviteEndpoint, (route) => route.abort());
  await page.getByRole("button", { name: "초대 보내기", exact: true }).click();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)')
  ).toContainText("요청을 완료하지 못했습니다");
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveValue(
    new RegExp(memberEmail)
  );
  await page.unroute(inviteEndpoint);
  await page.getByRole("button", { name: "초대 보내기", exact: true }).click();
  await expect(page.getByText("참여 1명 + 초대 2명 / 10석")).toBeVisible();
  await expect(
    page.getByText("발송 실패 · 재시도 필요", { exact: true }).first()
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("참여 1명 + 초대 2명 / 10석")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("owner-invitations.png"),
    fullPage: true,
  });
  const failedRow = page
    .getByRole("listitem")
    .filter({ hasText: failEmail })
    .filter({ has: page.getByRole("button", { name: "재발송", exact: true }) });
  await failedRow.getByRole("button", { name: "재발송", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("발송 실패");
  await failedRow
    .getByRole("button", { name: "초대 취소", exact: true })
    .click();
  await failedRow
    .getByRole("button", { name: "초대 취소", exact: true })
    .last()
    .click();
  await expect(page.getByText("참여 1명 + 초대 1명 / 10석")).toBeVisible();
  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  await expect(
    page.getByText("워크스페이스가 준비되었습니다", { exact: true })
  ).toBeVisible();

  const messages = (await (await request.get(`${api}/__test/mail`)).json()) as {
    to: string;
    inviteUrl: string;
  }[];
  const invitation = messages.findLast(
    (message) => message.to === memberEmail
  )!;
  expect(invitation).toBeTruthy();
  const memberContext = await browser.newContext({
    locale: "ko-KR",
    viewport: { width: 1280, height: 1000 },
  });
  const memberPage = await memberContext.newPage();
  memberPage.on("pageerror", (error) => browserErrors.push(error.message));
  await memberPage.goto(invitation.inviteUrl);
  await expect(memberPage).toHaveURL(/\/login\?/);
  await login(memberPage, "outsider@example.test");
  await expect(
    memberPage.locator('[role="alert"]:not(#__next-route-announcer__)')
  ).toContainText("다른 이메일로 받은 초대");
  await memberPage
    .getByRole("button", { name: "다른 계정으로 로그인" })
    .click();
  const inviteToken = invitation.inviteUrl.split("/").at(-1)!;
  await expect(
    memberPage.getByRole("link", { name: "계정 만들기", exact: true })
  ).toHaveAttribute("href", new RegExp(inviteToken));
  await memberPage
    .getByRole("link", { name: "계정 만들기", exact: true })
    .click();
  await expect(
    memberPage.getByRole("link", { name: "로그인", exact: true })
  ).toHaveAttribute("href", new RegExp(inviteToken));
  await memberPage.getByRole("link", { name: "로그인", exact: true }).click();
  await login(memberPage, memberEmail);
  await expect(
    memberPage.getByRole("heading", { name: "팀 초대를 받았습니다" })
  ).toBeVisible();
  await expect(
    memberPage.getByText(memberEmail, { exact: true }).last()
  ).toBeVisible();
  await memberPage.screenshot({
    path: testInfo.outputPath("accept-invitation.png"),
    fullPage: true,
  });
  await memberPage
    .getByRole("button", { name: "워크스페이스 참여", exact: true })
    .click();
  await expect(memberPage).toHaveURL(workspaceUrl);
  await expect(
    memberPage.getByText("참여 2명 + 초대 0명 / 10석")
  ).toBeVisible();
  await expect(
    memberPage.getByRole("button", { name: "초대 보내기" })
  ).toHaveCount(0);
  await memberPage.goto(invitation.inviteUrl);
  await expect(memberPage.getByText(/이미 수락한 초대입니다/)).toBeVisible();
  await memberPage
    .getByRole("button", { name: "워크스페이스 열기", exact: true })
    .click();
  await expect(
    memberPage.getByText("참여 2명 + 초대 0명 / 10석")
  ).toBeVisible();
  await memberContext.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("참여 2명 + 초대 0명 / 10석")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await expect(page.locator("#mobile-navigation")).toHaveAttribute("inert", "");
  await page.screenshot({
    path: testInfo.outputPath("workspace-mobile.png"),
    fullPage: true,
  });
  await page.route(`${api}/v2/workspaces/capabilities`, (route) =>
    route.fulfill({ status: 404, json: { message: "Not Found" } })
  );
  await page.goto("/dashboard/workspaces");
  await page.reload();
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)')
  ).toContainText("팀 온보딩을 아직 사용할 수 없습니다");
  await expect(
    page.getByRole("link", { name: "개인 계정으로 계속", exact: true })
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("an invited new user completes signup and returns directly to the invitation", async ({
  page,
  request,
}) => {
  const email = `new-${Date.now()}@example.test`;
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: "owner@example.test", password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "Signup test team" },
      })
    ).json()
  ).data.workspace;
  const sent = await request.post(
    `${api}/v2/workspaces/${workspace.id}/invitations`,
    { headers, data: { emails: [email], role: "reviewer" } }
  );
  expect(sent.status()).toBe(201);
  const messages = (await (await request.get(`${api}/__test/mail`)).json()) as {
    to: string;
    inviteUrl: string;
  }[];
  const invitation = messages.findLast((message) => message.to === email)!;
  await page.goto(invitation.inviteUrl);
  await page.getByRole("link", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "계정을 만들어 볼까요" })
  ).toBeVisible();
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("사용자 이름", { exact: true }).fill("New reviewer");
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "팀 초대를 받았습니다" })
  ).toBeVisible();
  await expect(page.getByText("검토자", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "워크스페이스 참여", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(workspace.id));
  await expect(page.getByRole("button", { name: "초대 보내기" })).toHaveCount(
    0
  );
});

test("HTTP routes enforce authentication, DTO constraints and tenant access", async ({
  request,
}) => {
  expect(
    (await request.get(`${api}/v2/workspaces/capabilities`)).status()
  ).toBe(401);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: "outsider@example.test", password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const own = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "HTTP contract test" },
      })
    ).json()
  ).data.workspace;
  expect(
    (await request.get(`${api}/v2/workspaces/not-a-uuid`, { headers })).status()
  ).toBe(400);
  expect(
    (
      await request.post(`${api}/v2/workspaces/${own.id}/invitations`, {
        headers,
        data: { emails: ["a@example.test"], role: "owner" },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post(`${api}/v2/workspaces/${own.id}/invitations`, {
        headers,
        data: { emails: Array(21).fill("a@example.test"), role: "editor" },
      })
    ).status()
  ).toBe(400);
  expect(
    (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "Injected", seatLimit: 999 },
      })
    ).status()
  ).toBe(400);
});
