import { test, expect, type Page } from "@playwright/test";

// Run against scripts/workspaces-preview.cjs in prepix-backend only. It uses a
// dedicated local DB and captures every outbound message; no production email
// is involved.
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";

type Message = { to: string; kind?: string; verifyUrl?: string };

// The harness captures mail from a send the API does not await, so a read taken
// the instant a request returns can legitimately arrive first. Poll for it.
async function mailbox(request: Page["request"], to: string, kind: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const all = (await (await request.get(`${api}/__test/mail`)).json()) as
      Message[];
    const found = all.findLast((m) => m.to === to && m.kind === kind);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

async function login(page: Page, email: string) {
  await expect(
    page.getByRole("heading", { name: "로그인", exact: true })
  ).toBeVisible();
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}

test("an unverified account is prompted everywhere, told an invitation waits without being told whose, and can verify for real", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const newcomer = `unverified-${suffix}@example.test`;
  // A fresh owner, because the seeded fixtures already own a workspace and
  // creation resumes it — which would leave the name below never used, and the
  // "must not see it" assertion passing for the wrong reason.
  const host = `host-${suffix}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email: host, password, username: "host" },
      })
    ).status()
  ).toBe(201);
  const owner = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: host, password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${owner.accessToken}` };
  const workspace = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: `Confidential ${suffix}` },
      })
    ).json()
  ).data.workspace;
  // The name the server actually stored — this is what must stay hidden.
  const teamName: string = workspace.name;
  expect(teamName).toContain(String(suffix));
  expect(
    (
      await request.post(`${api}/v2/workspaces/${workspace.id}/invitations`, {
        headers,
        data: { emails: [newcomer], role: "editor" },
      })
    ).status()
  ).toBe(201);
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email: newcomer, password, username: "newcomer" },
      })
    ).status()
  ).toBe(201);

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/dashboard?locale=ko");
  await login(page, newcomer);

  // The prompt is global: this is the personal overview, not a team page.
  await expect(page).toHaveURL(/\/dashboard/);
  const notice = page.getByRole("region").filter({
    hasText: "이메일 주소를 인증해 주세요",
  });
  await expect(
    page.getByText("이메일 주소를 인증해 주세요", { exact: true })
  ).toBeVisible();
  // An invitation is waiting — and the team behind it stays unnamed.
  await expect(page.getByText(/팀 초대가 1개 있습니다/)).toBeVisible();
  await expect(page.getByText(teamName)).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "인증 메일 다시 보내기" }))
    .toBeVisible();

  // The team page shows no invitation rows for an unverified account, because
  // the server sends none.
  await page.goto("/dashboard/workspaces");
  await expect(page.getByText(teamName)).toHaveCount(0);
  await expect(
    page.getByText("이메일 주소를 인증해 주세요", { exact: true })
  ).toBeVisible();

  // Resend, then verify with the link that actually arrives.
  await page
    .getByRole("button", { name: "인증 메일 다시 보내기", exact: true })
    .first()
    .click();
  await expect(page.getByText(/인증 메일을 보냈습니다/)).toBeVisible();
  const mail = await mailbox(request, newcomer, "verification");
  expect(mail?.verifyUrl).toBeTruthy();
  await page.goto(mail!.verifyUrl!);
  await expect(page.getByText("이메일 주소를 인증했습니다.")).toBeVisible();

  // Verified: the prompt is gone and the invitation is now named and actionable.
  await page
    .getByRole("link", { name: "워크스페이스로 이동", exact: true })
    .click();
  await expect(page.getByText(teamName).first()).toBeVisible();
  await expect(
    page.getByText("이메일 주소를 인증해 주세요", { exact: true })
  ).toHaveCount(0);
  // Accepting uses the invitation id, never a token the list never carried.
  await page.getByRole("button", { name: "초대 수락", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(workspace.id));
  expect(errors).toEqual([]);
});

test("invalid, already-used and missing verification links each say their own thing", async ({
  page,
  request,
}) => {
  const email = `spent-${Date.now()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "spent" },
      })
    ).status()
  ).toBe(201);
  const mail = await mailbox(request, email, "verification");
  expect(mail?.verifyUrl).toBeTruthy();

  await page.goto(`${mail!.verifyUrl!}&locale=ko`);
  await expect(page.getByText("이메일 주소를 인증했습니다.")).toBeVisible();

  // The same link a second time is spent, not invalid — and offers no resend,
  // because the address is already verified.
  await page.goto(`${mail!.verifyUrl!}&locale=ko`);
  await expect(page.getByText(/이미 사용한 링크입니다/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "인증 메일 다시 보내기" })
  ).toHaveCount(0);

  // A token that was never issued is a different answer again.
  await page.goto(`/verify-email?token=${"a".repeat(64)}&locale=ko`);
  await expect(page.getByText(/인증 링크가 올바르지 않습니다/)).toBeVisible();

  // And no token at all must not look like a success.
  await page.goto("/verify-email?locale=ko");
  await expect(page.getByText(/인증 링크가 올바르지 않습니다/)).toBeVisible();
  await expect(page.getByText("이메일 주소를 인증했습니다.")).toHaveCount(0);
});
