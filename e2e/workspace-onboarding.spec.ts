import { test, expect, type Page } from "@playwright/test";

// Run against scripts/workspaces-preview.cjs in prepix-backend only. It uses a
// dedicated local DB and captures mail; no production email/payment is involved.
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";
/**
 * Seats are five separate figures now, never one sentence. `team.seatCount`
 * ("참여 1명 + 초대 2명 / 10석") still read as a single sum and omitted suspended
 * members entirely, which is the number the Dropbox admin watched refuse to
 * move while it quietly held the seats he thought he had released.
 */
async function expectSeats(
  page: Page,
  figures: { active: number; invited: number; remaining: number }
) {
  const panel = page.locator('[data-seats="split"]');
  for (const [name, value] of Object.entries(figures))
    await expect(panel.locator(`[data-seat="${name}"]`)).toHaveText(
      String(value)
    );
}

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
    page.getByRole("heading", { name: "워크스페이스", level: 1 })
  ).toBeVisible();
  // Creating a workspace is not this test's subject — invitation delivery,
  // recovery and acceptance are. Every account is provisioned one, so driving
  // the create form here would either make a second (it cannot: the backend
  // caps at one per account) or silently resume the provisioned one under a
  // different name. Take whichever exists and give it a deterministic name
  // over the API instead, so this test reads the same before and after
  // provisioning lands.
  const ownerSession = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: ownerEmail, password },
      })
    ).json()
  ).data;
  const ownerHeaders = { Authorization: `Bearer ${ownerSession.accessToken}` };
  const owned = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: ownerHeaders,
        data: { name: "Studio onboarding" },
      })
    ).json()
  ).data.workspace;
  if (owned.name !== "Studio onboarding") {
    const renamed = await request.post(
      `${api}/v2/workspaces/${owned.id}/settings`,
      {
        headers: ownerHeaders,
        data: {
          name: "Studio onboarding",
          description: owned.description ?? "",
          revision: owned.revision ?? 0,
        },
      }
    );
    expect(renamed.status()).toBe(201);
  }
  const workspaceId: string = owned.id;
  const workspaceUrl = `http://localhost:3001/dashboard/workspaces/${workspaceId}`;
  // Spec §13: the create screen must not state a price, a seat minimum or a
  // quota. The seat sentence it does carry is checked here because nothing
  // else visits this page any more.
  await page.goto("/dashboard/workspaces/new");
  await expect(
    page.getByText(/워크스페이스를 만들어도 결제되지 않습니다/)
  ).toBeVisible();
  await page.goto(workspaceUrl);
  // First run lands on the invite step. The heading is the team's own name —
  // it is their workspace, not a wizard — so the step marker is what says
  // where in setup this is.
  await expect(page.getByText("2. 팀원 초대")).toHaveAttribute(
    "aria-current",
    "step",
  );
  // A transport failure leaves the form retryable with its exact draft intact.
  const inviteEndpoint = `${api}/v2/workspaces/${workspaceId}/invitations`;
  // The form lives in a modal now, opened by the roster's own 초대 button.
  await page.getByRole("button", { name: "초대", exact: true }).click();
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
  await expectSeats(page, { active: 1, invited: 2, remaining: 7 });
  await expect(
    page.getByText("발송 실패 · 재시도 필요", { exact: true }).first()
  ).toBeVisible();
  await page.reload();
  await expectSeats(page, { active: 1, invited: 2, remaining: 7 });
  await page.screenshot({
    path: testInfo.outputPath("owner-invitations.png"),
    fullPage: true,
  });
  // Members and invitations share one table, and a row's actions live behind
  // its kebab — the same affordance for a person and for a promise.
  const failedRow = page.getByRole("row").filter({ hasText: failEmail });
  await failedRow.getByRole("button", { name: "작업" }).click();
  await page.getByRole("menuitem", { name: "재발송", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("발송 실패");
  await failedRow.getByRole("button", { name: "작업" }).click();
  await page.getByRole("menuitem", { name: "초대 취소", exact: true }).click();
  // Revoking asks once before it releases the seat.
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "초대 취소", exact: true })
    .click();
  // Revoking gives the seat straight back, and it is visible in `invited` and
  // `remaining` moving together while `active` does not.
  await expectSeats(page, { active: 1, invited: 1, remaining: 8 });
  await page.getByRole("button", { name: "설정 완료", exact: true }).click();
  // 4df91bc replaced the standalone "ready" panel with the workspace home;
  // completing setup now lands there. The seat sentence lives on the members
  // page from this point on, so the assertions below go there for it.
  await expect(
    page.getByRole("heading", { name: "Studio onboarding", level: 1 })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "멤버와 초대", level: 2 })
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
  await memberPage.goto(`${workspaceUrl}/members`);
  await expectSeats(memberPage, { active: 2, invited: 0, remaining: 8 });
  await expect(
    memberPage.getByRole("button", { name: "초대 보내기" })
  ).toHaveCount(0);
  // An already-accepted invitation must navigate, not re-POST accept: the old
  // button only worked because the server happens to be idempotent. Blocking
  // the accept route proves nothing is posted here any more.
  await memberPage.route(
    `${api}/v2/workspaces/invitations/${inviteToken}/accept`,
    (route) => route.abort()
  );
  await memberPage.goto(invitation.inviteUrl);
  await expect(memberPage.getByText(/이미 수락한 초대입니다/)).toBeVisible();
  await memberPage
    .getByRole("link", { name: "워크스페이스 열기", exact: true })
    .click();
  // Straight to the team, from `workspaceId` on the preview — not a detour
  // through the workspace list.
  await expect(memberPage).toHaveURL(workspaceUrl);
  await memberPage.unroute(
    `${api}/v2/workspaces/invitations/${inviteToken}/accept`
  );
  await memberPage.goto(`${workspaceUrl}/members`);
  await expectSeats(memberPage, { active: 2, invited: 0, remaining: 8 });
  await memberContext.close();

  // BLOCKER 1: a failed BACKGROUND refresh must not take the page with it. The
  // provider used to `setData(null)` on any failure, and the `!data` gate then
  // unmounted every child — so a three-second wifi drop during the 30s poll or
  // a window focus destroyed a half-typed invitation list.
  const detail = `${api}/v2/workspaces/${workspaceId}`;
  await page.goto(`${workspaceUrl}/members`);
  const draft = `keep-${suffix}@example.test`;
  // Behind the roster's 초대 button, which is the only way in now.
  await page.getByRole("button", { name: "초대", exact: true }).click();
  await page.getByLabel("이메일 주소", { exact: true }).fill(draft);
  await page.route(detail, (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)').first()
  ).toContainText("요청을 완료하지 못했습니다");
  // The structure — and the draft inside it — is still there.
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveValue(
    draft
  );
  await expectSeats(page, { active: 2, invited: 0, remaining: 8 });
  await page.unroute(detail);

  // BLOCKER 3: a 5xx is not an answer, so it must not render as "this server
  // has no team product" (which also hid the nav entry with no way back).
  const capabilities = `${api}/v2/workspaces/capabilities`;
  await page.route(capabilities, (route) =>
    route.fulfill({ status: 503, json: { message: "Service Unavailable" } })
  );
  await page.goto("/dashboard/workspaces");
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)').first()
  ).toContainText("팀 서비스에 연결하지 못했습니다");
  await expect(
    page.getByRole("button", { name: "다시 시도", exact: true })
  ).toBeVisible();
  // The way back survives the blip: the switcher and its nav stay in the
  // sidebar rather than the whole team entry vanishing over a 503.
  await expect(
    page.getByRole("navigation", { name: "워크스페이스 메뉴" })
  ).toBeVisible();
  await page.unroute(capabilities);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workspaceUrl}/members`);
  await expectSeats(page, { active: 2, invited: 0, remaining: 8 });
  // The members table scrolls inside its own box; the PAGE must not. An
  // absolutely-positioned `sr-only` label in the table escaped that box's
  // clip and dragged the document's scroll width out with it.
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
  // An invitation whose link says the recipient is new goes STRAIGHT to the
  // form. It used to stop at /start for a "계정 만들기" link first; the server
  // already decided which of sign-in or sign-up this person needs, and saying
  // it twice was a hop that asked them to choose what had been chosen.
  await expect(page).toHaveURL(/\/signup\?/);
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

/**
 * The point of this test is that it fails if provisioning regresses, and now
 * also if the personal/team distinction does (spec D13).
 *
 * A brand-new account must arrive in a space that is already its own, with no
 * create step in front of it — and that space must read as PERSONAL, not as a
 * team it happens to be alone in. Step 2 is no longer the old two-card fork
 * ("내 영상 편집하기 / 팀과 함께 시작하기"), which was a signup-time choice
 * between things that are now two persistent objects: the personal space is
 * simply there, and a team is a separate, explicit action taken later.
 */
test("a new account lands in its own personal space, and a team is an explicit extra step", async ({
  page,
}) => {
  const suffix = Date.now();
  const email = `firstrun-${suffix}@example.test`;
  const username = `firstrun-${suffix}`;
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/signup?locale=ko");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("사용자 이름", { exact: true }).fill(username);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();

  // First run, not the dashboard and not a create form — and the space it
  // lands in is named for what it is, never "<account>의 워크스페이스".
  await expect(page).toHaveURL(/\/start\b/);
  await expect(
    page.getByRole("heading", { name: "개인 공간이 준비되었습니다" })
  ).toBeVisible();
  await expect(page.getByText(username)).toHaveCount(0);
  // The empty state is gone, and so is every route to it from here.
  await expect(
    page.getByRole("link", { name: "워크스페이스 만들기", exact: true })
  ).toHaveCount(0);
  await expect(page.getByText("아직 참여한 워크스페이스가 없습니다")).toHaveCount(
    0
  );
  // Nothing here invites anyone into the personal space, and nothing offers to
  // convert it — the backend blocks conversion outright, so the UI must not
  // hint at one.
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/팀으로 전환|Convert to a team/)).toHaveCount(0);

  // Continuing without making a team is a perfectly good answer, and the invite
  // step says so instead of showing a form with nobody to put in it.
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page.getByText(/아직 팀이 없어서 초대할 사람도 없습니다/)).toBeVisible();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);

  // Back to step 2 to take the other branch: a team, made deliberately.
  await page.goBack();
  await page.getByRole("button", { name: "팀 만들기", exact: true }).click();
  const teamName = `First run team ${suffix}`;
  await page.getByLabel("팀 이름", { exact: true }).fill(teamName);
  await page.getByRole("button", { name: "팀 만들기", exact: true }).click();

  // Now there IS somebody to invite, and the form says which space they join.
  await expect(
    page.getByRole("heading", { name: "함께할 팀원을 초대하세요" })
  ).toBeVisible();
  await expect(page.locator('form [data-space="team"]')).toContainText(teamName);
  await expect(page.getByLabel("이메일 주소", { exact: true })).toBeVisible();

  // Skipping is visible and explicit, never a silent completion.
  await page.getByRole("button", { name: "나중에 하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "컴퓨터에서 Prepix를 여세요" })
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /다운로드와 설치 안내/ })
  ).toBeVisible();

  // The workspace list agrees: two entries, two kinds, personal first.
  await page.goto("/dashboard/workspaces?locale=ko");
  const main = page.locator("main");
  await expect(main.locator('[data-space="personal"]')).toHaveCount(1);
  await expect(main.locator('[data-space="team"]')).toContainText(teamName);
  expect(browserErrors).toEqual([]);
});

/**
 * The Linear trap: deleting your last workspace put you in a redirect loop
 * where your own account settings were unreachable, because they were gated
 * behind workspace membership. Ours are not, and this keeps it that way — an
 * account with no workspace at all still reaches settings, plan and usage.
 */
test("account pages stay reachable for an account with no workspace", async ({
  page,
  request,
}) => {
  const email = `nospace-${Date.now()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: email.split("@")[0] },
      })
    ).status()
  ).toBe(201);
  // Force the "no workspace yet" shape regardless of what the server does, so
  // this covers the transient window while provisioning is still catching up.
  await page.route(`${api}/v2/workspaces`, (route) =>
    route.fulfill({
      status: 200,
      json: { data: { workspaces: [], invitations: [], pendingInvitationCount: 0 } },
    })
  );
  await page.goto("/dashboard/settings?locale=ko");
  await expect(page).toHaveURL(/\/login\?/);
  await login(page, email);
  // Let the post-login navigation land before driving the address bar; a goto
  // on top of it aborts the request that stores the session.
  await expect(page).toHaveURL(/\/dashboard\/settings/);
  for (const path of [
    "/dashboard/settings",
    "/dashboard/plan",
    "/dashboard/usage",
    "/dashboard",
  ]) {
    await page.goto(`${path}?locale=ko`);
    await expect(page).toHaveURL(new RegExp(`${path}\\?`));
    await expect(page.locator("main")).toBeVisible();
  }
  // And the list itself says the server is behind — it does not ask the user
  // to repair it by creating one. The wording moved (it used to explain the
  // database invariant to the reader); what must hold is that the empty list
  // is an alert offering a retry, not an empty state offering a fix.
  await page.goto("/dashboard/workspaces?locale=ko");
  const empty = page
    .locator('[role="alert"]:not(#__next-route-announcer__)')
    .first();
  await expect(empty).toContainText("준비하고 있습니다");
  await expect(empty.getByRole("button", { name: "다시 시도" })).toBeVisible();
});

/**
 * The join offer is the one conditional step, so both of its branches matter:
 * it must appear when `pendingInvitationCount` says there is something to
 * join, and skipping it must land on the workspace the account already has.
 */
test("first run offers a waiting invitation and skipping it lands on your own workspace", async ({
  page,
  request,
}) => {
  const email = `invitee-${Date.now()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: email.split("@")[0] },
      })
    ).status()
  ).toBe(201);
  const owner = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: "owner@example.test", password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${owner.accessToken}` };
  // A fixed name on purpose: same creator + same name resumes, so repeated
  // runs do not eat into this account's creation allowance.
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: "Join offer team" },
      })
    ).json()
  ).data.workspace;
  expect(
    (
      await request.post(`${api}/v2/workspaces/${workspace.id}/invitations`, {
        headers,
        data: { emails: [email], role: "reviewer" },
      })
    ).status()
  ).toBe(201);

  // /start is public — a signed-out visitor gets the connect-your-account
  // panel, not a redirect, and signing in from it comes straight back.
  await page.goto("/start?locale=ko");
  await page
    .getByRole("link", { name: "기존 계정으로 로그인", exact: true })
    .click();
  await login(page, email);
  await expect(page).toHaveURL(/\/start\b/);
  await expect(
    page.getByRole("heading", { name: "초대를 받았습니다" })
  ).toBeVisible();
  // Skippable, visibly — never a silent completion.
  await page.getByRole("button", { name: "나중에 하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "개인 공간이 준비되었습니다" })
  ).toBeVisible();
  // Landing on your OWN space, not on the team that invited you — and titled
  // by what it is rather than by the account that owns it.
  await expect(page.getByText(email.split("@")[0])).toHaveCount(0);
});
