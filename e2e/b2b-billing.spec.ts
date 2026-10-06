import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Real Chrome, real local Nest/JWT API and PostgreSQL; the payment provider is
// the local HTTP PG double (scripts/b2b-pg-double.cjs). Requires the preview
// harness with B2B_TEST_BILLING=true. Nothing here touches a real PG.
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3308";
const double = process.env.B2B_E2E_PG_DOUBLE_URL ?? "http://127.0.0.1:3547";
const opsKey = process.env.B2B_E2E_OPERATIONS_KEY ?? "local-preview-operations-key-0123456789";
const password = "LocalPreview123";

async function account(request: APIRequestContext, prefix: string) {
  const email = `${prefix}-${crypto.randomUUID()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: prefix } })).status()).toBe(201);
  const session = (await (await request.post(`${api}/v2/auth/email/login`, { data: { email, password } })).json()).data;
  return { email, headers: { Authorization: `Bearer ${session.accessToken}` } };
}
async function team(request: APIRequestContext, headers: Record<string, string>) {
  const created = await request.post(`${api}/v2/workspaces`, { headers, data: { name: "로컬 결제 팀", requestKey: crypto.randomUUID() } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.workspace.id as string;
  const billing = (await (await request.get(`${api}/v2/workspaces/${id}/b2b/billing`, { headers })).json()).data;
  test.skip(!billing?.readiness?.billing, "Requires the preview harness with B2B_TEST_BILLING=true");
  return id;
}
async function login(page: Page, email: string, path: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}
const buyer = {
  businessName: "로컬 결제 주식회사",
  businessRegistrationNumber: "1234567890",
  representative: "로컬 대표",
  address: "서울 로컬구 1",
  receiptEmail: "finance@example.test",
};

test("a late payment return cannot clear the query of the next client-side view", async ({ page, request }) => {
  const owner = await account(request, "billing-late-return");
  const id = await team(request, owner.headers);
  await login(page, owner.email, `/dashboard/workspaces/${id}/plan/settings`);
  await saveProfile(page);
  await expect(page.getByLabel("상호", { exact: true })).toBeEnabled();
  await page.goto(`/dashboard/workspaces/${id}/plan`);
  await page.getByRole("button", { name: "견적 확인", exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let received!: () => void;
  const completed = new Promise<void>((resolve) => { received = resolve; });
  let handled!: () => void;
  const handlerDone = new Promise<void>((resolve) => { handled = resolve; });
  let calls = 0;
  await page.route(`${api}/v2/workspaces/${id}/b2b/commerce/orders/*/confirm`, async (route) => {
    calls++;
    const response = await route.fetch();
    received();
    await gate;
    try { await route.fulfill({ response }); } finally { handled(); }
  });
  try {
    await page.getByRole("button", { name: /^결제하기/ }).click();
    await page.waitForURL(`${double}/checkout?**`);
    await page.getByRole("link", { name: "결제 인증 완료" }).click();
    await completed;
    // Next Link keeps the original JS promise alive while unmounting the order.
    await page.getByRole("link", { name: "플랜과 결제로 돌아가기", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${id}/plan$`));
    await page.evaluate(() => {
      window.history.replaceState(null, "", `${window.location.pathname}?return_probe=preserve`);
    });
    release();
    await handlerDone;
    await expect(page.getByRole("heading", { name: "플랜과 결제", exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("return_probe")).toBe("preserve");
    expect(calls).toBe(1);
    const orders = (await (await request.get(`${api}/v2/workspaces/${id}/b2b/commerce/orders`, { headers: owner.headers })).json()).data;
    expect(orders.items).toHaveLength(1);
    await expect.poll(async () => {
      const current = (await (await request.get(`${api}/v2/workspaces/${id}/b2b/commerce/orders`, { headers: owner.headers })).json()).data;
      return current.items[0].state;
    }).toBe("applied");
  } finally { release(); }
});
async function saveProfile(page: Page) {
  await page.getByLabel("상호", { exact: true }).fill(buyer.businessName);
  await page.getByLabel("사업자등록번호", { exact: true }).fill(buyer.businessRegistrationNumber);
  await page.getByLabel("대표자", { exact: true }).fill(buyer.representative);
  await page.getByLabel("사업장 주소", { exact: true }).fill(buyer.address);
  await page.getByLabel("증빙 수신 이메일", { exact: true }).fill(buyer.receiptEmail);
  await page.getByRole("button", { name: "사업자 정보 저장", exact: true }).click();
}

test("purchase survives lost replies: one profile change, one order, one payment, applied once", async ({ page, request }) => {
  const owner = await account(request, "billing-buy");
  const id = await team(request, owner.headers);
  await login(page, owner.email, `/dashboard/workspaces/${id}/plan/settings`);
  // Lost reply on the profile change: the original request is confirmed, not repeated.
  let profileCalls = 0;
  await page.route(`${api}/v2/workspaces/${id}/b2b/billing/profile`, async (route) => {
    profileCalls++;
    if (profileCalls === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await saveProfile(page);
  await expect(page.getByRole("button", { name: /결과 확인/ })).toBeVisible();
  await expect(page.getByLabel("상호", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: /결과 확인/ }).click();
  await expect(page.getByRole("button", { name: /결과 확인/ })).toHaveCount(0);
  expect(profileCalls).toBe(1);
  const billing = (await (await request.get(`${api}/v2/workspaces/${id}/b2b/billing`, { headers: owner.headers })).json()).data;
  expect(billing.profile.revision).toBe(0);
  // Quote, then a lost order reply; the retry finds the same order.
  await page.goto(`/dashboard/workspaces/${id}/plan`);
  await page.getByLabel("추가 편집 이용권", { exact: true }).fill("1");
  await page.getByRole("button", { name: "견적 확인", exact: true }).click();
  let orderCalls = 0;
  await page.route(`${api}/v2/workspaces/${id}/b2b/commerce/orders`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    orderCalls++;
    if (orderCalls === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByRole("button", { name: /^결제하기/ }).click();
  await expect(page.getByRole("button", { name: "같은 주문 결과 확인", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "같은 주문 결과 확인", exact: true }).click();
  // The local PG double's payment window.
  await page.waitForURL(`${double}/checkout?**`);
  expect(orderCalls).toBe(1);
  await page.getByRole("link", { name: "결제 인증 완료" }).click();
  await page.waitForURL(`**/plan/orders/**`);
  await expect(page.getByText("반영 완료", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(page.url()).not.toContain("paymentKey");
  const orders = (await (await request.get(`${api}/v2/workspaces/${id}/b2b/commerce/orders`, { headers: owner.headers })).json()).data;
  expect(orders.items).toHaveLength(1);
  expect(orders.items[0].state).toBe("applied");
  // Refresh after application does not confirm again or show a new checkout.
  await page.reload();
  await expect(page.getByText("반영 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^결제하기/ })).toHaveCount(0);
  // A tampered return for another amount is never confirmed.
  await page.goto(`${page.url().split("?")[0]}?pg=success&paymentKey=tdbl_forged&orderId=${orders.items[0].providerOrderId}&amount=1`);
  await expect(page.getByText("반영 완료", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("반영 완료", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/billing-order-390.png", fullPage: true });
});

test("card registration, renewal plan, refund reservation and account switch keep teams and accounts apart", async ({ page, request }) => {
  const owner = await account(request, "billing-card");
  const id = await team(request, owner.headers);
  await login(page, owner.email, `/dashboard/workspaces/${id}/plan/settings`);
  await saveProfile(page);
  await expect(page.getByLabel("상호", { exact: true })).toBeEnabled();
  await page.getByRole("checkbox", { name: /월 자동결제에 이 카드를 사용하는 데 동의합니다/ }).check();
  await page.getByRole("button", { name: "카드 등록", exact: true }).click();
  await page.waitForURL(`${double}/billing-auth?**`);
  await page.getByRole("link", { name: "카드 등록 완료" }).click();
  await page.waitForURL(`**/plan/settings**`);
  await expect(page.getByText("결제 수단을 등록했습니다.")).toBeVisible();
  await expect(page.getByText("43301234****123*")).toBeVisible();
  expect(page.url()).not.toContain("authKey");
  // Buy the first month through the API double, then add a seat for the refund.
  const h = owner.headers,
    base = `${api}/v2/workspaces/${id}/b2b`;
  const product = (await (await request.get(`${base}/commerce`, { headers: h })).json()).data.product;
  const buy = async (target: string, extra: number, sourcePeriodId?: string) => {
    const quote = (await (await request.post(`${base}/commerce/quotes`, { headers: h, data: { requestKey: crypto.randomUUID(), productVersion: product.version, target, sourcePeriodId, renewal: "one_off", extraSeats: extra, aiPacks: 0, storagePacks: 0 } })).json()).data.quote;
    const order = (await (await request.post(`${base}/commerce/orders`, { headers: h, data: { requestKey: crypto.randomUUID(), quoteId: quote.id, buyer: { schemaVersion: "local-v1", ...buyer } } })).json()).data;
    const checkout = (await (await request.get(`${base}/commerce/orders/${order.orderId}/checkout`, { headers: h })).json()).data;
    const back = await request.get(`${double}/checkout/approve?${new URLSearchParams({ clientKey: checkout.client.clientKey, orderId: checkout.providerOrderId, amount: String(checkout.amount), orderName: checkout.orderName, successUrl: "http://localhost:3541/r", failUrl: "http://localhost:3541/f" })}`, { maxRedirects: 0 });
    const paymentKey = new URL(back.headers().location).searchParams.get("paymentKey");
    await request.post(`${base}/commerce/orders/${order.orderId}/confirm`, { headers: h, data: { paymentKey } });
    for (let i = 0; i < 30; i++) {
      const state = (await (await request.get(`${base}/commerce/orders/${order.orderId}`, { headers: h })).json()).data.order.state;
      if (state === "applied") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return order.orderId as string;
  };
  await buy("initial", 0);
  const period = (await (await request.get(`${base}/commerce`, { headers: h })).json()).data.currentPeriod;
  const addition = await buy("current", 2, period.id);
  // Renewal: switching to automatic needs explicit consent and never charges.
  await page.reload();
  const renewal = page.getByRole("combobox", { name: "갱신 방식", exact: true });
  await expect(renewal).toBeEnabled({ timeout: 30_000 });
  await renewal.selectOption("automatic");
  await page.getByLabel("다음 기간 추가 이용권", { exact: true }).fill("1");
  await page.getByRole("checkbox", { name: /매월 기간 종료 전에 등록 카드로 결제하는 데 동의합니다/ }).check();
  await page.getByRole("button", { name: "갱신 설정 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "자동결제 중지", exact: true })).toBeVisible();
  const orders = (await (await request.get(`${base}/commerce/orders`, { headers: h })).json()).data;
  expect(orders.items).toHaveLength(2);
  // Refund one seat of the addition: reserved first, refunded after the operator.
  await page.goto(`/dashboard/workspaces/${id}/plan/orders/${addition}`);
  await page.getByLabel("환불할 추가 이용권", { exact: true }).fill("1");
  await page.getByLabel("환불 사유", { exact: true }).fill("로컬 환불 확인");
  await page.getByRole("button", { name: "환불 금액 확인", exact: true }).click();
  await page.getByRole("button", { name: /^환불 요청/ }).click();
  await expect(page.locator('[data-refund-state="reserved"]')).toBeVisible();
  const refund = (await (await request.get(`${base}/commerce/refunds?orderId=${addition}`, { headers: h })).json()).data.items[0];
  const decided = await request.post(`${api}/v2/b2b/operations/refunds/${refund.id}/decision`, {
    headers: { "x-b2b-operations-key": opsKey },
    data: { decision: "approve", operator: "local operator", reason: "로컬 승인", expectedTotalKrw: refund.amounts.totalKrw },
  });
  expect((await decided.json()).data.refund.state).toBe("refunded");
  await page.reload();
  await expect(page.locator('[data-refund-state="refunded"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/workspaces/${id}/plan/settings`);
  await expect(page.getByLabel("상호", { exact: true })).toHaveValue(buyer.businessName);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/billing-settings-390.png", fullPage: true });
  // Another account in the same browser never sees this team's business data.
  const other = await account(request, "billing-other");
  const otherTeam = await team(request, other.headers);
  await page.evaluate(() => localStorage.clear());
  await login(page, other.email, `/dashboard/workspaces/${otherTeam}/plan/settings`);
  await expect(page.getByLabel("상호", { exact: true })).toHaveValue("");
  await expect(page.getByText(buyer.businessName)).toHaveCount(0);
  await expect(page.getByText("43301234****123*")).toHaveCount(0);
  await page.goto(`/dashboard/workspaces/${id}/plan/settings`);
  await expect(page.getByText(buyer.businessName)).toHaveCount(0);
});

test("a payment-window return confirms only in the scope that started it", async ({ page, request }) => {
  const owner = await account(request, "billing-scope");
  const id = await team(request, owner.headers);
  const h = owner.headers,
    base = `${api}/v2/workspaces/${id}/b2b`;
  const product = (await (await request.get(`${base}/commerce`, { headers: h })).json()).data.product;
  const quote = (await (await request.post(`${base}/commerce/quotes`, { headers: h, data: { requestKey: crypto.randomUUID(), productVersion: product.version, target: "initial", renewal: "one_off", extraSeats: 0, aiPacks: 0, storagePacks: 0 } })).json()).data.quote;
  const order = (await (await request.post(`${base}/commerce/orders`, { headers: h, data: { requestKey: crypto.randomUUID(), quoteId: quote.id, buyer: { schemaVersion: "local-v1", ...buyer } } })).json()).data;
  const orderPage = `/dashboard/workspaces/${id}/plan/orders/${order.orderId}`;
  await login(page, owner.email, orderPage);
  await page.getByRole("button", { name: /^결제하기/ }).click();
  await page.waitForURL(`${double}/checkout?**`);
  const approve = await page.getByRole("link", { name: "결제 인증 완료" }).getAttribute("href");
  // The return opens under another account: the start record names the first one.
  await page.goto(orderPage);
  await expect(page.getByRole("button", { name: /^결제하기/ })).toBeVisible();
  const tamper = (userId: string) =>
    page.evaluate((u) => {
      for (const k of Object.keys(localStorage))
        if (k.startsWith("prepix-b2b-pg:")) {
          const v = JSON.parse(localStorage.getItem(k)!);
          v.scope.userId = u;
          localStorage.setItem(k, JSON.stringify(v));
        }
      return Object.keys(localStorage).filter((k) => k.startsWith("prepix-b2b-pg:")).length;
    }, userId);
  const own = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("prepix-b2b-pg:"))!)!).scope.userId as string);
  expect(await tamper("00000000-0000-4000-8000-000000000000")).toBe(1);
  await page.goto(approve!.startsWith("http") ? approve! : `${double}${approve}`);
  await page.waitForURL(`**/plan/orders/**`);
  await expect(page.getByText(/결제를 확정하지 않았습니다/)).toBeVisible();
  const held = (await (await request.get(`${base}/commerce/orders/${order.orderId}`, { headers: h })).json()).data.order;
  expect(held.state).toBe("awaiting_payment");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Back in the scope that started it, the same return confirms.
  await tamper(own);
  await page.reload();
  await expect(page.getByText("반영 완료", { exact: true })).toBeVisible({ timeout: 30_000 });
});
