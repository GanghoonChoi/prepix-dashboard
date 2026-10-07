import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { harnessEnv } from "./harness-env";
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";
async function account(request: APIRequestContext) {
  const email = `creation-${crypto.randomUUID()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "team-creation" },
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
  return { email, headers: { Authorization: `Bearer ${session.accessToken}` } };
}
async function signIn(page: Page, email: string) {
  await page.goto("/login?returnTo=%2Fdashboard%2Fworkspaces&locale=ko");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
}
test("B2B team creation preserves 100-character request after lost response and permits distinct equal names", async ({
  page,
  request,
}) => {
  const owner = await account(request);
  const capabilities = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities`, {
        headers: owner.headers,
      })
    ).json()
  ).data;
  test.skip(
    capabilities.newTeamPolicy !== "b2b_v1",
    "Requires B2B_TEST_NEW_TEAMS=true local harness",
  );
  await signIn(page, owner.email);
  await page.goto("/dashboard/workspaces/new");
  const name = "한".repeat(100);
  const input = page.getByLabel("워크스페이스 이름", { exact: true });
  await expect(input).toHaveAttribute("maxlength", "100");
  await expect(
    page.getByText(/첫 구매가 반영되면 이용기간이 시작됩니다/),
  ).toBeVisible();
  await expect(page.getByText(/멤버 10석/)).toHaveCount(0);
  let teamId = "",
    firstKey = "",
    calls = 0;
  await page.route(`${api}/v2/workspaces`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const input = route.request().postDataJSON();
    expect(input.name).toBe(name);
    if (calls++ === 0) {
      firstKey = input.requestKey;
      expect(firstKey).toBeTruthy();
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      teamId = (await response.json()).data.workspace.id;
      return route.abort("failed");
    }
    expect(input.requestKey).toBe(firstKey);
    return route.continue();
  });
  await input.fill(name);
  await page
    .getByRole("button", { name: "워크스페이스 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "생성한 팀 확인하기", exact: true }),
  ).toBeVisible();
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue(name);
  await page
    .getByRole("button", { name: "생성한 팀 확인하기", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/workspaces/${teamId}$`));
  await expect(
    page.getByText(/첫 이용권 반영 전에는 이용기간이 시작되지 않습니다/),
  ).toBeVisible();
  const firstStatus = (
    await (
      await request.get(`${api}/v2/workspaces/${teamId}/b2b/status`, {
        headers: owner.headers,
      })
    ).json()
  ).data;
  expect(firstStatus.team.periodEndsAt).toBeNull();
  await page.unroute(`${api}/v2/workspaces`);
  await page.goto("/dashboard/workspaces/new");
  await page.getByLabel("워크스페이스 이름", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "워크스페이스 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/workspaces\/[a-f0-9-]{36}$/);
  expect(page.url()).not.toContain(teamId);
  const teams = (
    await (
      await request.get(`${api}/v2/workspaces`, { headers: owner.headers })
    ).json()
  ).data.workspaces.filter((row: { type: string }) => row.type === "team");
  expect(teams).toHaveLength(2);
  expect(
    teams.every(
      (row: { name: string; b2bEnrolled: boolean }) =>
        row.name === name && row.b2bEnrolled,
    ),
  ).toBe(true);
});

test("B2B first-run creation retries its known team after destination failure and keeps preparation gates", async ({
  page,
  request,
}) => {
  const owner = await account(request);
  const capabilities = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities`, {
        headers: owner.headers,
      })
    ).json()
  ).data;
  test.skip(
    capabilities.newTeamPolicy !== "b2b_v1",
    "Requires B2B_TEST_NEW_TEAMS=true local harness",
  );
  await signIn(page, owner.email);
  await page.goto("/start?step=workspace&locale=ko");
  await page.getByRole("button", { name: "팀 만들기", exact: true }).click();
  const name = "나".repeat(100);
  await expect(page.getByLabel("팀 이름", { exact: true })).toHaveAttribute(
    "maxlength",
    "100",
  );
  await expect(
    page.getByText(/첫 구매가 반영되면 이용기간이 시작됩니다/),
  ).toBeVisible();
  let created = false,
    creates = 0,
    failedDestination = false;
  await page.route(`${api}/v2/workspaces`, async (route) => {
    if (route.request().method() === "POST") {
      creates++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      created = true;
      return route.fulfill({ response });
    }
    if (created && !failedDestination) {
      failedDestination = true;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Local destination failure" }),
      });
    }
    return route.continue();
  });
  await page.getByLabel("팀 이름", { exact: true }).fill(name);
  await page.getByRole("button", { name: "팀 만들기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "생성한 팀 확인하기", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("팀 이름", { exact: true })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "취소", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "생성한 팀 확인하기", exact: true })
    .click();
  await expect(page).toHaveURL(/step=invite/);
  await expect(
    page.getByRole("link", { name: "팀 홈으로 이동하기", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  expect(creates).toBe(1);
  expect(failedDestination).toBe(true);
  await page
    .getByRole("link", { name: "팀 홈으로 이동하기", exact: true })
    .click();
  await expect(
    page.getByText(/첫 이용권 반영 전에는 이용기간이 시작되지 않습니다/),
  ).toBeVisible();
});

test("dashboard deployed before keyed backend preserves the older creation DTO", async ({
  page,
  request,
}) => {
  const owner = await account(request);
  const name = `Older API ${crypto.randomUUID()}`;
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name, requestKey: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  const acknowledgement = await created.json();
  await page.route(`${api}/v2/workspaces/capabilities`, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    delete body.data.creationRequestKeys;
    delete body.data.newTeamPolicy;
    delete body.data.maxTeamNameLength;
    body.data.previewSeats = 10;
    return route.fulfill({ response, json: body });
  });
  let legacyRequest = false;
  await page.route(`${api}/v2/workspaces`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    expect(route.request().postDataJSON()).toEqual({ name });
    legacyRequest = true;
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify(acknowledgement),
    });
  });
  await signIn(page, owner.email);
  await page.goto("/dashboard/workspaces/new");
  await expect(
    page.getByLabel("워크스페이스 이름", { exact: true }),
  ).toHaveAttribute("maxlength", "80");
  await page.getByLabel("워크스페이스 이름", { exact: true }).fill(name);
  await page
    .getByRole("button", { name: "워크스페이스 만들기", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/workspaces/${acknowledgement.data.workspace.id}$`),
  );
  expect(legacyRequest).toBe(true);
});
