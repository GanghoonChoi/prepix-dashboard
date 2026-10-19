import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { harnessEnv } from "./harness-env";

// Light ↔ Creator on a subscription we bill (policy 2026-10-19). The harness has
// no billing module, so the subscription endpoints are answered here with the
// backend's shapes; what is pinned is what the page says before money moves
// and exactly what it asks the server to do.
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";

async function account(request: APIRequestContext) {
  const email = `switch-${crypto.randomUUID()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: "switch" } })).status()).toBe(201);
  return email;
}
async function login(page: Page, email: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent("/dashboard/plan?locale=ko")}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}

const month = (id: string, amount: number) => [{ interval: "month", currency: "KRW", unitAmount: amount, launchDiscountPercent: 0 }];
const plans = [
  { id: "free", displayName: "Free", status: "active", displayOrder: 0, inferenceSecondsPerMonth: 3600, videosPerMonth: -1, storageLimitBytes: -1, prices: [] },
  { id: "light", displayName: "Light", status: "active", displayOrder: 1, inferenceSecondsPerMonth: 10800, videosPerMonth: -1, storageLimitBytes: -1, prices: month("light", 29900) },
  { id: "creator", displayName: "Creator", status: "active", displayOrder: 2, inferenceSecondsPerMonth: 18000, videosPerMonth: -1, storageLimitBytes: -1, prices: month("creator", 49900) },
];
const subscribed = (plan: string, scheduledPlan: string | null = null) => ({
  plan,
  status: "active",
  provider: "tosspayments",
  renews: true,
  manageable: true,
  scheduledPlan,
  currentPeriodStart: "2026-10-01T00:00:00+09:00",
  currentPeriodEnd: "2026-11-01T00:00:00+09:00",
  refundEligible: false,
  refund: { action: "none", rate: "none", daysElapsed: 9, pendingThreadId: null },
});

async function serve(page: Page, current: () => unknown, onChange: (body: Record<string, unknown>) => unknown) {
  await page.route(/\/v2\/subscriptions\/current$/, (route) => route.fulfill({ json: { data: current() } }));
  await page.route(/\/v2\/subscriptions\/plans(\?.*)?$/, (route) => route.fulfill({ json: { data: plans } }));
  await page.route(/\/v2\/subscriptions\/change-plan$/, (route) =>
    route.fulfill({ json: { data: onChange(route.request().postDataJSON() as Record<string, unknown>) } }),
  );
}

test("Light → Creator: the dialog says the amount, minutes, dates and refund terms before charging that amount", async ({ page, request }) => {
  const email = await account(request);
  let plan = "light";
  const asked: Record<string, unknown>[] = [];
  await serve(page, () => subscribed(plan), (body) => {
    asked.push(body);
    plan = "creator";
    return { plan: "creator", scheduledPlan: null, charged: 20000 };
  });
  await login(page, email);

  await page.getByRole("button", { name: "Creator로 업그레이드" }).click();
  const dialog = page.getByRole("dialog", { name: "Creator로 업그레이드" });
  await expect(dialog).toContainText("오늘 20,000원을 결제하면 Creator로 즉시 바뀌어요");
  await expect(dialog).toContainText("추가 120분은");
  await expect(dialog).toContainText("10월 31일까지");
  await expect(dialog).toContainText("다음 정기 결제일은 2026년 11월 1일이에요");
  // Refunds: the difference goes with the period's payment (2026-10-01), same band.
  await expect(dialog).toContainText("이번 기간 구독 결제(2026년 10월 1일)와 같은 환불 기준을 따라요");
  await expect(dialog).toContainText("7일 이내 전액, 14일 이내 50%");
  await dialog.getByRole("button", { name: "20,000원 결제하고 업그레이드" }).click();

  await expect(page.getByText("Creator로 바꿨어요")).toBeVisible();
  expect(asked).toEqual([{ newPlanId: "creator", interval: "month", amount: 20000 }]);
});

test("Creator → Light waits for the renewal; the current plan's card takes it back", async ({ page, request }) => {
  const email = await account(request);
  let scheduled: string | null = null;
  const asked: Record<string, unknown>[] = [];
  await serve(page, () => subscribed("creator", scheduled), (body) => {
    asked.push(body);
    scheduled = body.newPlanId === "light" ? "light" : null;
    return { plan: "creator", scheduledPlan: scheduled };
  });
  await login(page, email);

  await page.getByRole("button", { name: "다음 결제일부터 변경" }).click();
  const dialog = page.getByRole("dialog", { name: "다음 결제일부터 Light로 변경" });
  await expect(dialog).toContainText("Creator 권한과 남은 처리량을 그대로");
  await expect(dialog).toContainText("Light 29,900원을 결제하고 180분을 새로 드려요");
  await expect(dialog).toContainText("이번 결제분이 환불되지는 않아요");
  await dialog.getByRole("button", { name: "변경 예약" }).click();

  // Scheduled: said under the plan name, and the Light card is no longer a button to press.
  // (The toast ends with a full stop; the line under the plan name does not.)
  await expect(page.getByText(/부터 Light로 바뀌어요$/)).toBeVisible();
  await expect(page.getByRole("button", { name: /부터 적용/ })).toBeDisabled();
  await page.getByRole("button", { name: "Creator 계속 이용" }).click();
  await expect(page.getByText("Creator를 계속 이용해요")).toBeVisible();
  expect(asked).toEqual([
    { newPlanId: "light", interval: "month" },
    { newPlanId: "creator", interval: "month" },
  ]);
});
