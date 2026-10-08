import { test, expect, type Page } from "@playwright/test";
import { harnessEnv } from "./harness-env";

// Run against scripts/workspaces-preview.cjs in prepix-backend with new B2B
// teams on (B2B_TEST_ENABLED, B2B_TEST_NEW_TEAMS, B2B_TEST_LAUNCH_DEFAULTS)
// and the dashboard on NEXT_PUBLIC_START_ONBOARDING=1. Spec:
// docs/plans/onboarding-renewal-design-2026-10-08.md
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";

async function signup(page: Page, email: string, query = "") {
  await page.goto(`/signup?locale=ko${query}`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("사용자 이름", { exact: true }).fill(email.split("@")[0]);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "계정 만들기", exact: true }).click();
}

async function get<T>(page: Page, path: string): Promise<T> {
  const token = await page.evaluate(() => localStorage.getItem("accessToken"));
  const response = await page.request.get(`${api}/v2${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data as T;
}

test("personal: one answer, a name for your own workspace, then the app", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = `solo-${Date.now()}@example.test`;
  await signup(page, email);

  await expect(page).toHaveURL(/\/start\b/);
  await expect(page.getByRole("heading", { name: "Prepix를 어떻게 쓰실 건가요?" })).toBeVisible();
  await page.getByRole("button", { name: /혼자 쓸게요/ }).click();

  await expect(page.getByRole("heading", { name: "어떤 일을 하시나요?" })).toBeVisible();
  await page.getByRole("button", { name: "편집자", exact: true }).click();
  await page.getByRole("button", { name: "계속하기", exact: true }).click();

  await expect(page.getByRole("heading", { name: "워크스페이스 이름을 정하세요" })).toBeVisible();
  const name = page.getByLabel("워크스페이스 이름", { exact: true });
  await expect(name).toHaveValue(/의 워크스페이스$/);
  await name.fill("내 작업실");
  await page.getByRole("button", { name: "계속하기", exact: true }).click();

  await expect(page.getByRole("heading", { name: "컴퓨터에서 Prepix를 여세요" })).toBeVisible();
  // No team steps on this path.
  await expect(page.getByText("결제")).toHaveCount(0);

  const profile = await get<{ useType: string; jobRole: string }>(page, "/users/profile");
  expect(profile.useType).toBe("personal");
  expect(profile.jobRole).toBe("editor");
  const list = await get<{ workspaces: { type: string; name: string }[] }>(page, "/workspaces");
  expect(list.workspaces.find((w) => w.type === "personal")?.name).toBe("내 작업실");
  expect(errors).toEqual([]);
});

test("business: team name, invitations held until payment, pay later lands on the team", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = Date.now();
  const email = `lead-${suffix}@example.test`;
  const hire = `hire-${suffix}@example.test`;
  await signup(page, email, `&returnTo=${encodeURIComponent("/start?intent=team")}`);

  await expect(page).toHaveURL(/\/start\?.*intent=team/);
  // The site already asked, so the first question is not asked again.
  await expect(page.getByRole("heading", { name: "Prepix를 어떻게 쓰실 건가요?" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "어떤 일을 하시나요?" })).toBeVisible();
  await page.getByRole("button", { name: "건너뛰기", exact: true }).click();

  await expect(page.getByRole("heading", { name: "팀 워크스페이스를 만드세요" })).toBeVisible();
  await page.getByLabel("회사 또는 팀 이름", { exact: true }).fill(`Studio ${suffix}`);
  await page.getByRole("button", { name: "6–20명", exact: true }).click();
  await page.getByRole("button", { name: "팀 만들기", exact: true }).click();

  await expect(page.getByRole("heading", { name: "함께할 팀원을 초대하세요" })).toBeVisible();
  // Your own address is dropped; one teammate + you is still the 3-seat floor.
  await page.getByLabel("팀원 이메일", { exact: true }).fill(`${hire}\n${email}`);
  await expect(page.getByText(/나 포함 2명 → 3석/)).toBeVisible();
  await page.getByRole("button", { name: "다음", exact: true }).click();

  await expect(page.getByRole("heading", { name: "좌석을 확인하고 결제하세요" })).toBeVisible();
  await expect(page.getByText("3석", { exact: true })).toBeVisible();
  await expect(page.getByText("결제가 끝나면 1명에게 초대가 발송됩니다.")).toBeVisible();
  await page.getByRole("button", { name: "나중에 결제", exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard\/workspaces\/[0-9a-f-]{36}/);
  await expect(page.getByText("결제하면 1명에게 초대가 발송됩니다.")).toBeVisible();
  const id = /workspaces\/([0-9a-f-]{36})/.exec(page.url())![1];
  const invitations = await get<{ invitations: { email: string; deliveryState: string }[] }>(
    page,
    `/workspaces/${id}/b2b/invitations`,
  );
  expect(invitations.invitations.map((i) => [i.email, i.deliveryState])).toEqual([[hire, "held"]]);
  const profile = await get<{ useType: string; teamSize: string }>(page, "/users/profile");
  expect(profile).toMatchObject({ useType: "team", teamSize: "6-20" });
  expect(errors).toEqual([]);
});
