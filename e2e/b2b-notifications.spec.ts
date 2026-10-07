import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { harnessEnv } from "./harness-env";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Local acceptance only (S27/F19): backend preview harness with
// B2B_TEST_ENABLED, B2B_TEST_NEW_TEAMS, B2B_TEST_PRODUCT and
// B2B_TEST_NOTIFICATIONS on the same explicit WORKSPACES_TEST_DATABASE_URL.
// Payments run real order code against the PG double fixture.
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";
const shots = process.env.B2B_E2E_SCREENSHOT_DIR;
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
    (await request.post(`${api}/v2/auth/email/verify/request`, { headers })).status(),
  ).toBe(200);
  let verifyUrl = "";
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      verifyUrl =
        mail.findLast(
          (m: { to: string; verifyUrl?: string }) => m.to === email && m.verifyUrl,
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
  return { email, headers, id: session.user.id as string, session };
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
    { timeout: 30_000 },
  );
}
async function login(page: Page, user: Account, target: string) {
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}
const unread = async (request: APIRequestContext, user: Account) =>
  (
    await (
      await request.get(`${api}/v2/b2b/notifications/unread`, {
        headers: { ...user.headers, "X-Prepix-Account-ID": user.id },
      })
    ).json()
  ).data.unreadCount as number;

test("S27 notifications: current access, late and lost responses, reconnect, account switch and 390px", async ({
  browser,
  request,
}) => {
  test.setTimeout(240_000);
  const [owner, lead, ext] = [
    await account(request, "notify-owner"),
    await account(request, "notify-lead"),
    await account(request, "notify-ext"),
  ];
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "Notify web team", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace.id as string;
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: lead.id });
  const project = (
    await (
      await request.post(`${api}/v2/workspaces/${team}/b2b/projects`, {
        headers: lead.headers,
        data: { requestKey: randomUUID(), name: "Secret campaign" },
      })
    ).json()
  ).data.project.id as string;
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team}/b2b/invitations`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          email: ext.email,
          kind: "external",
          teamRole: "editor",
          projectId: project,
          projectRole: "producer",
          canDownload: false,
        },
      })
    ).status(),
  ).toBe(201);
  let token = "";
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      token =
        mail
          .findLast(
            (m: { to: string; inviteUrl?: string }) =>
              m.to === ext.email && m.inviteUrl?.includes("/b2b-invitations/"),
          )
          ?.inviteUrl.split("/b2b-invitations/")[1]
          .split("?")[0] ?? "";
      return token;
    })
    .toBeTruthy();
  expect(
    (
      await request.post(`${api}/v2/b2b/invitations/${token}/accept`, {
        headers: ext.headers,
      })
    ).status(),
  ).toBe(201);
  const assign = async (title: string) =>
    (
      await (
        await request.post(
          `${api}/v2/workspaces/${team}/b2b/projects/${project}/requests`,
          {
            headers: lead.headers,
            data: {
              requestKey: randomUUID(),
              title,
              body: "Deliver",
              assigneeId: ext.id,
              confirmerId: lead.id,
              shared: false,
            },
          },
        )
      ).json()
    ).data.request.id as string;
  const first = await assign("Private subtitle");
  await expect.poll(() => unread(request, ext), { timeout: 30_000 }).toBe(1);

  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  await login(page, ext, "/dashboard/notifications");
  await expect(page.getByRole("heading", { name: "알림", exact: true })).toBeVisible();
  const entry = page.locator('aside a[href="/dashboard/notifications"]').first();
  await expect(entry.getByLabel("읽지 않은 알림 1개")).toBeVisible();
  const row = page.getByRole("button", { name: /요청 담당자로 지정됐어요/ });
  const view = page.getByRole("group", { name: "보기" });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Notify web team · Secret campaign");
  if (shots) await page.screenshot({ path: `${shots}/s27-desktop.png`, fullPage: true });

  // A list failure is an error with retry, never "no notifications".
  await page.route("**/v2/b2b/notifications?*", (route) =>
    route.fulfill({ status: 500, json: { statusCode: 500, message: "INTERNAL" } }),
  );
  await page.reload();
  await expect(page.getByText("목록이 비어 있다는 뜻은 아니에요", { exact: false })).toBeVisible();
  await expect(page.getByText("알림이 없어요.")).toHaveCount(0);
  await page.unroute("**/v2/b2b/notifications?*");
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(row).toHaveCount(1);

  // Late answer for an older view is dropped: a slow "all" list must not
  // overwrite the newer "unread" view.
  await page.getByRole("button", { name: "읽음으로" }).click();
  await expect(entry.getByLabel(/읽지 않은 알림/)).toHaveCount(0);
  await page.route("**/v2/b2b/notifications?filter=all*", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });
  await view.getByRole("button", { name: /^읽지 않음/ }).click();
  await expect(page.getByText("읽지 않은 알림이 없어요.")).toBeVisible();
  await view.getByRole("button", { name: "전체", exact: true }).click();
  await view.getByRole("button", { name: /^읽지 않음/ }).click();
  await page.waitForTimeout(3500);
  await expect(page.getByText("읽지 않은 알림이 없어요.")).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.unroute("**/v2/b2b/notifications?filter=all*");
  await view.getByRole("button", { name: "전체", exact: true }).click();
  await expect(row).toHaveCount(1);

  // Reconnect re-queries: an event that happened offline appears on "online".
  await context.setOffline(true);
  await assign("Second private task");
  await expect.poll(() => unread(request, ext), { timeout: 30_000 }).toBe(1);
  await context.setOffline(false);
  await expect(row).toHaveCount(2);
  await expect(entry.getByLabel("읽지 않은 알림 1개")).toBeVisible();

  // Lost reply to "open": the server marked it read, the UI says it failed,
  // and a refresh shows the server's state with no duplicate.
  await page.route("**/v2/b2b/notifications/*/open", async (route) => {
    const reply = await route.fetch();
    expect(reply.status()).toBe(201);
    await route.abort();
  });
  await row.first().click();
  await expect(page.getByText("알림을 열지 못했어요", { exact: false })).toBeVisible();
  await page.unroute("**/v2/b2b/notifications/*/open");
  await page.reload();
  await expect(row).toHaveCount(2);
  expect(await unread(request, ext)).toBe(0);

  // Clicking rechecks the target and opens the exact request.
  await row.last().click();
  await expect(page).toHaveURL(
    new RegExp(`/dashboard/workspaces/${team}/projects/${project}/requests/${first}$`),
  );
  await expect(page.getByText("Private subtitle").first()).toBeVisible();

  // Revocation: old notices lose names and links; clicking gives the generic
  // notice; nothing new is created for the lost project.
  const people = await (
    await request.get(`${api}/v2/workspaces/${team}/b2b/projects/${project}`, {
      headers: lead.headers,
    })
  ).json();
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team}/b2b/projects/${project}/people`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          revision: people.data.project.revision,
          userId: ext.id,
          role: "producer",
          canDownload: false,
          remove: true,
          reason: "Contract ended",
        },
      })
    ).status(),
  ).toBe(201);
  await expect.poll(() => unread(request, ext), { timeout: 30_000 }).toBe(1);
  await page.goto("/dashboard/notifications");
  const lost = page.getByRole("button", { name: /현재 계정으로 볼 수 없는 알림이에요/ });
  await expect(lost).toHaveCount(2);
  // A lost item is not counted, so it shows no unread dot/label and no toggle.
  const lostRows = page.locator("li").filter({ has: lost });
  await expect(
    lostRows.getByRole("button", { name: /^(읽음으로|읽지 않음으로)$/ }),
  ).toHaveCount(0);
  await expect(lostRows.filter({ hasText: "읽지 않음" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /한 폴더의 참여가 끝났어요/ })).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toContain("Secret campaign");
  await lost.first().click();
  await expect(page.getByText("현재 계정으로 이 내용을 열 수 없어요", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/notifications$/);
  // The request itself stays closed even by direct address.
  await page.goto(`/dashboard/workspaces/${team}/projects/${project}/requests/${first}`);
  await expect(page.getByText("Private subtitle")).toHaveCount(0);

  // A persistent account mismatch asks the profile once and shows the error;
  // it must not reload in a loop.
  let navigations = 0;
  const counted = () => void navigations++;
  page.on("framenavigated", counted);
  await page.route("**/v2/b2b/notifications?*", (route) =>
    route.fulfill({
      status: 403,
      json: { statusCode: 403, message: "B2B_NOTIFICATION_ACCOUNT_CHANGED" },
    }),
  );
  await page.goto("/dashboard/notifications");
  await expect(
    page.getByText("B2B_NOTIFICATION_ACCOUNT_CHANGED", { exact: false }),
  ).toBeVisible();
  await page.waitForTimeout(2500);
  page.off("framenavigated", counted);
  await page.unroute("**/v2/b2b/notifications?*");
  expect(navigations).toBeLessThanOrEqual(2);
  await page.goto("/dashboard/notifications");

  // 390px: one column, no horizontal scroll, the entry is in the mobile menu.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/notifications");
  await expect(lost.first()).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  if (shots) await page.screenshot({ path: `${shots}/s27-390.png`, fullPage: true });
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(
    page.locator('#mobile-navigation a[href="/dashboard/notifications"]'),
  ).toBeVisible();
  await page.setViewportSize({ width: 1360, height: 1100 });

  // Account switch in another tab: this tab drops ext's list and shows only
  // what the owner (billing, not a participant) may see.
  await page.goto("/dashboard/notifications");
  await expect(page.getByRole("button", { name: /한 폴더의 참여가 끝났어요/ })).toBeVisible();
  // The other tab performs the login page's exact writes for a real owner
  // session (the login form itself redirects while a session exists).
  const other = await context.newPage();
  await other.goto("/dashboard");
  const fresh = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: owner.email, password },
      })
    ).json()
  ).data;
  await other.evaluate((s) => {
    localStorage.setItem("accessToken", s.accessToken);
    localStorage.setItem("refreshToken", s.refreshToken);
    localStorage.setItem("userInfo", JSON.stringify(s.user));
  }, fresh);
  await expect(page.getByRole("button", { name: /한 폴더의 참여가 끝났어요/ })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /결제가 확인됐어요/ })).toBeVisible();
  const ownerView = await page.locator("main").innerText();
  expect(ownerView).not.toContain("Secret campaign");
  expect(ownerView).not.toContain("요청");
  if (shots) await page.screenshot({ path: `${shots}/s27-owner.png`, fullPage: true });

  expect(errors).toEqual([]);
  await context.close();
});
