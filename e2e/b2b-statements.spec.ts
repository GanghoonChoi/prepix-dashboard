import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Local preview: B2B_TEST_ENABLED/NEW_TEAMS/PRODUCT/STATEMENTS=true and
// WORKSPACES_TEST_DATABASE_URL set for the fixtures (fake provider only).
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3308",
  password = "LocalPreview123",
  scripts = resolve("../prepix-backend/backend/scripts");
const run = (args: string[], input: object, env: Record<string, string> = {}) =>
  JSON.parse(
    execFileSync(process.execPath, [...args, JSON.stringify(input)], {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, ...env },
    }),
  );
const purchase = (input: object, at?: string) =>
  run(
    [
      ...(at ? ["-r", `${scripts}/fixtures/fixed-clock.cjs`] : []),
      `${scripts}/b2b-paid-test-fixture.cjs`,
    ],
    input,
    at ? { B2B_FIXTURE_CLOCK: at } : {},
  );
const issueAtFixtureDate = (input: object) =>
  run([`${scripts}/b2b-statement-test-fixture.cjs`], input);
const kstMonth = (instant: number) =>
  new Date(instant + 9 * 3600000).toISOString().slice(0, 7);

async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  expect(
    (await request.post(`${api}/v2/auth/register`, { data: { email, password, username: label } })).status(),
  ).toBe(201);
  const session = (
    await (await request.post(`${api}/v2/auth/email/login`, { data: { email, password } })).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  expect((await request.post(`${api}/v2/auth/email/verify/request`, { headers })).status()).toBe(200);
  let message: { verifyUrl: string } | undefined;
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${api}/__test/mail`)).json();
      message = mailbox.findLast((m: { to: string; verifyUrl?: string }) => m.to === email && m.verifyUrl);
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
  return { email, id: session.user.id as string, headers };
}
async function signIn(page: Page, email: string, target: string) {
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target));
}
async function team(request: APIRequestContext, owner: { headers: Record<string, string> }, name: string) {
  return (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name, requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace as { id: string };
}
async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
}

test("S25 statements: lost issue response recovers by the same key, verified PDF bytes, corrections, delegate revocation and 390px", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(180000);
  const owner = await account(request, "statement-owner"),
    finance = await account(request, "statement-finance"),
    outsider = await account(request, "statement-outsider");
  const past = await team(request, owner, "명세 지난 달 검증");
  const endpoint = `${api}/v2/workspaces/${past.id}/b2b`;
  const status = (await (await request.get(`${endpoint}/status`, { headers: owner.headers })).json()).data;
  test.skip(!status.enrolled, "Requires the local B2B statement preview");
  // A fake-provider purchase recorded two KST months ago: closed and due today.
  const now = Date.now();
  const civil = new Date(now + 9 * 3600000);
  const pastAt = new Date(
    Date.UTC(civil.getUTCFullYear(), civil.getUTCMonth() - 2, 15, 3, 0, 0),
  ).toISOString();
  const month = kstMonth(Date.parse(pastAt));
  purchase({ workspaceId: past.id, action: "purchase", target: "initial" }, pastAt);

  const list = `/dashboard/workspaces/${past.id}/statements`;
  await signIn(page, owner.email, list);
  const label = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  const row = page.getByRole("link", { name: new RegExp(label) });
  await expect(row).toContainText("발행 대기");
  await expect(page.getByText(/세금계산서가 아닙니다/)).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/statements/${month}$`));

  // The server issues, the browser never hears back.
  let calls = 0;
  await page.route(`${endpoint}/statements/${month}/issue`, async (route) => {
    calls++;
    if (calls === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "명세 발행 요청", exact: true }).click();
  await expect(page.getByRole("button", { name: "같은 발행 요청 결과 다시 확인" })).toBeVisible();
  const stored = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("prepix:b2b-statement-issue:")),
  );
  expect(stored).toHaveLength(1);
  const firstKey = JSON.parse((await page.evaluate((k) => localStorage.getItem(k), stored[0]))!).requestKey;
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith(`/statements/${month}/issue`)) sent.push(r.postDataJSON().requestKey);
  });
  await page.reload();
  await expect(page.getByText("revision 1 ·", { exact: false })).toBeVisible();
  expect(sent).toContain(firstKey);
  expect(sent.every((k) => k === firstKey)).toBe(true);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("prepix:b2b-statement-issue:")).length),
  ).toBe(0);
  const detail = (
    await (await request.get(`${endpoint}/statements/${month}`, { headers: owner.headers })).json()
  ).data;
  expect(detail.revisions).toHaveLength(1);
  expect(detail.revisions[0].snapshot.purchases).toHaveLength(1);

  // Download, then check the saved file against the issued hash ourselves.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF 받기" }).first().click();
  const file = await download;
  const saved = testInfo.outputPath(file.suggestedFilename());
  await file.saveAs(saved);
  const bytes = readFileSync(saved);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(detail.revisions[0].pdf.sha256);
  expect(bytes.length).toBe(detail.revisions[0].pdf.bytes);
  await expect(page.getByText("SHA-256 일치 확인")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("statement-detail-desktop.png"), fullPage: true });

  // A same-month correction is a second immutable revision.
  const current = await team(request, owner, "명세 정정 검증");
  const currentApi = `${api}/v2/workspaces/${current.id}/b2b`;
  const thisMonth = kstMonth(now);
  purchase({ workspaceId: current.id, action: "purchase", target: "initial" });
  issueAtFixtureDate({ workspaceId: current.id, month: thisMonth });
  const periodId = (
    await (await request.get(`${currentApi}/commerce`, { headers: owner.headers })).json()
  ).data.currentPeriod.id;
  purchase({ workspaceId: current.id, action: "purchase", target: "current", sourcePeriodId: periodId });
  const corrected = issueAtFixtureDate({ workspaceId: current.id, month: thisMonth });
  expect(corrected.revisions.map((r: { revision: number }) => r.revision)).toEqual([1, 2]);
  await page.goto(`/dashboard/workspaces/${current.id}/statements/${thisMonth}`);
  await expect(page.getByText("revision 2 · 정정본", { exact: false })).toBeVisible();
  await expect(page.getByText("늦게 확인된 수납 반영", { exact: false })).toBeVisible();
  for (const index of [0, 1]) {
    const next = page.waitForEvent("download");
    await page.getByRole("button", { name: "PDF 받기" }).nth(index).click();
    const pdf = await next;
    const path = testInfo.outputPath(`r${index}-${pdf.suggestedFilename()}`);
    await pdf.saveAs(path);
    expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(
      corrected.revisions[1 - index].pdf_sha256,
    );
  }

  // 390px: list and detail stay within the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(list);
  await expect(page.getByText("확정", { exact: false }).first()).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("statement-list-390.png"), fullPage: true });
  await page.goto(`${list}/${month}`);
  await expect(page.getByText("revision 1 ·", { exact: false })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("statement-detail-390.png"), fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1100 });

  // A billing delegate (active team) reads while delegated; revocation removes the data.
  expect(
    (
      await request.post(`${currentApi}/invitations`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          email: finance.email,
          kind: "internal",
          teamRole: "editor",
          canDownload: false,
        },
      })
    ).status(),
  ).toBe(201);
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${api}/__test/mail`)).json();
      offer = mailbox.findLast(
        (m: { to: string; inviteUrl?: string }) => m.to === finance.email && m.inviteUrl?.includes("/b2b-invitations/"),
      );
      return offer?.inviteUrl;
    })
    .toBeTruthy();
  const token = new URL(offer!.inviteUrl).pathname.split("/").at(-1);
  expect(
    (await request.post(`${api}/v2/b2b/invitations/${token}/accept`, { headers: finance.headers })).status(),
  ).toBe(201);
  const delegate = (billingAllowed: boolean, revision: number) =>
    request.post(`${currentApi}/members/${finance.id}`, {
      headers: owner.headers,
      data: {
        requestKey: randomUUID(),
        revision,
        kind: "internal",
        billingAllowed,
        reason: billingAllowed ? "재무 담당 위임" : "재무 담당 위임 종료",
      },
    });
  expect((await delegate(true, 0)).status()).toBe(201);
  const financeContext = await browser.newContext();
  const financePage = await financeContext.newPage();
  const currentList = `/dashboard/workspaces/${current.id}/statements`;
  await signIn(financePage, finance.email, currentList);
  await expect(financePage.getByRole("link", { name: /확정/ })).toBeVisible();
  expect((await delegate(false, 1)).status()).toBe(201);
  await financePage.getByRole("button", { name: "최신 상태 확인" }).click();
  await expect(financePage.getByRole("alert")).toBeVisible();
  await expect(financePage.getByRole("link", { name: /확정/ })).toHaveCount(0);
  const denied = await request.get(`${currentApi}/statements/revisions/${corrected.revisions[0].id}/pdf`, {
    headers: finance.headers,
  });
  expect(denied.status()).toBe(403);
  await financeContext.close();

  // Another account never sees this team's statement, even by direct address.
  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await signIn(outsiderPage, outsider.email, "/dashboard");
  await outsiderPage.goto(`${list}/${month}`);
  await expect(outsiderPage.getByText(/SHA-256/)).toHaveCount(0);
  await expect(outsiderPage.getByText("revision 1", { exact: false })).toHaveCount(0);
  await outsiderContext.close();
});
