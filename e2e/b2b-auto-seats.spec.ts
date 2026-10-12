import { test, expect } from "@playwright/test";
import { api, account, allMail, json, shot } from "./b2b-review-helpers";

// 멤버 추가 자동결제 (2026-10-12): real Chrome, local API and PostgreSQL, the
// PG double for every charge. Requires the preview harness with
// B2B_TEST_NEW_TEAMS, B2B_TEST_PRODUCT and B2B_TEST_BILLING.
const double = process.env.B2B_E2E_PG_DOUBLE_URL ?? "http://127.0.0.1:3547";
const buyer = { businessName: "로컬 결제 주식회사", businessRegistrationNumber: "1234567890", representative: "로컬 대표", address: "서울 로컬구 1", receiptEmail: "finance@example.test" };

test("a member who joins mid-period gets a seat, paid for the days left, with nothing to press", async ({ page, request }) => {
  const owner = await account(request, "auto-owner");
  const id = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "자동 좌석 팀", requestKey: crypto.randomUUID() } }))).workspace.id as string;
  const base = `${api}/v2/workspaces/${id}/b2b`, h = owner.headers;
  test.skip(!(await json(request.get(`${base}/billing`, { headers: h }))).readiness?.billing, "Requires the preview harness with B2B_TEST_BILLING=true");

  await page.goto(`/login?returnTo=${encodeURIComponent(`/dashboard/workspaces/${id}/plan/settings`)}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(owner.email);
  await page.getByLabel("비밀번호", { exact: true }).fill("LocalPreview123");
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await page.getByLabel("상호", { exact: true }).fill(buyer.businessName);
  await page.getByLabel("사업자등록번호", { exact: true }).fill(buyer.businessRegistrationNumber);
  await page.getByLabel("대표자", { exact: true }).fill(buyer.representative);
  await page.getByLabel("사업장 주소", { exact: true }).fill(buyer.address);
  await page.getByLabel("증빙 수신 이메일", { exact: true }).fill(buyer.receiptEmail);
  await page.getByRole("button", { name: "사업자 정보 저장", exact: true }).click();
  await expect(page.getByLabel("상호", { exact: true })).toBeEnabled();
  // Before a card and automatic renewal, the switch says what to set up first.
  await expect(page.getByText("먼저 위에서 매월 자동결제와 카드를 설정해 주세요.")).toBeVisible();
  await page.getByRole("checkbox", { name: /월 자동결제에 이 카드를 사용하는 데 동의합니다/ }).check();
  await page.getByRole("button", { name: "카드 등록", exact: true }).click();
  await page.waitForURL(`${double}/billing-auth?**`);
  await page.getByRole("link", { name: "카드 등록 완료" }).click();
  await page.waitForURL(`**/plan/settings**`);
  await expect(page.getByText("결제 수단을 등록했습니다.")).toBeVisible();

  // The first month, through the checkout double.
  const product = (await json(request.get(`${base}/commerce`, { headers: h }))).product;
  const quote = (await json(request.post(`${base}/commerce/quotes`, { headers: h, data: { requestKey: crypto.randomUUID(), productVersion: product.version, target: "initial", renewal: "one_off", extraSeats: 0, aiPacks: 0, storagePacks: 0 } }))).quote;
  const order = await json(request.post(`${base}/commerce/orders`, { headers: h, data: { requestKey: crypto.randomUUID(), quoteId: quote.id, buyer: { schemaVersion: "local-v1", ...buyer } } }));
  const checkout = await json(request.get(`${base}/commerce/orders/${order.orderId}/checkout`, { headers: h }));
  const back = await request.get(`${double}/checkout/approve?${new URLSearchParams({ clientKey: checkout.client.clientKey, orderId: checkout.providerOrderId, amount: String(checkout.amount), orderName: checkout.orderName, successUrl: "http://localhost:3541/r", failUrl: "http://localhost:3541/f" })}`, { maxRedirects: 0 });
  await request.post(`${base}/commerce/orders/${order.orderId}/confirm`, { headers: h, data: { paymentKey: new URL(back.headers().location!).searchParams.get("paymentKey") } });
  await expect.poll(async () => (await json(request.get(`${base}/commerce/orders/${order.orderId}`, { headers: h }))).order.state, { timeout: 30_000 }).toBe("applied");

  // Automatic renewal, then the switch with its own consent.
  await page.reload();
  const renewal = page.getByRole("combobox", { name: "갱신 방식", exact: true });
  await expect(renewal).toBeEnabled({ timeout: 30_000 });
  await renewal.selectOption("automatic");
  await page.getByLabel("다음 기간 추가 좌석 (최대)", { exact: true }).fill("0");
  await page.getByRole("checkbox", { name: /매월 기간 종료 전에 등록 카드로 결제하는 데 동의합니다/ }).check();
  await page.getByRole("button", { name: "갱신 설정 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "자동결제 중지", exact: true })).toBeVisible();
  const on = page.getByRole("button", { name: "켜기", exact: true });
  await expect(on).toBeDisabled();
  await page.getByRole("checkbox", { name: /남은 기간만큼 좌석 요금.*바로 결제하는 데 동의합니다/ }).check();
  await on.click();
  await expect(page.getByText(/부터 켜져 있어요/)).toBeVisible();
  await page.getByRole("heading", { name: "멤버 추가 자동결제" }).scrollIntoViewIfNeeded();
  await shot(page, "auto-seats-on");

  // Three seats: owner plus two editors fill them; the third editor is one too many.
  const people = await Promise.all(["auto-a", "auto-b", "auto-c"].map((n) => account(request, n)));
  // As the invite form sends it: an editor wants a seat.
  for (const p of people) {
    expect((await request.post(`${base}/invitations`, { headers: h, data: { requestKey: crypto.randomUUID(), email: p.email, kind: "internal", teamRole: "editor", assignSeat: true } })).status()).toBe(201);
    let url = "";
    await expect.poll(async () => (url = (await allMail(request)).findLast((m: { to: string; inviteUrl?: string }) => m.to === p.email && m.inviteUrl?.includes("/b2b-invitations/"))?.inviteUrl ?? ""), { timeout: 30_000 }).toBeTruthy();
    expect((await request.post(`${api}/v2/b2b/invitations/${new URL(url).pathname.split("/").at(-1)}/accept`, { headers: p.headers })).status()).toBe(201);
  }
  const roster = async () => (await json(request.get(`${base}/members`, { headers: h }))) as { seats: { capacity: number; assigned: number; waiting: number }; autoSeats: boolean };
  expect((await roster()).autoSeats).toBe(true);
  // The worker buys the shortfall within a tick or two; nobody presses 좌석 추가.
  await expect.poll(async () => (await roster()).seats, { timeout: 90_000, intervals: [2000] }).toEqual({ capacity: 4, assigned: 4, waiting: 0 });
  await page.goto(`/dashboard/workspaces/${id}/members`);
  await page.getByRole("button", { name: "초대", exact: true }).click();
  await expect(page.getByTestId("invite-seat-info")).toContainText("자동결제 카드로 결제되고");
  await shot(page, "auto-seats-invite-hint");
  await page.keyboard.press("Escape");
  const orders = (await json(request.get(`${base}/commerce/orders`, { headers: h }))).items as { quote?: { target: string }; target?: string; state: string; amounts: { totalKrw: number } }[];
  const seat = orders.find((o) => (o.target ?? o.quote?.target) === "current");
  expect(seat?.state).toBe("applied");
  expect(seat!.amounts.totalKrw).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByTestId("seat-shortage")).toHaveCount(0);
  await shot(page, "auto-seats-members-after");
  await page.goto(`/dashboard/workspaces/${id}/plan`);
  await expect(page.getByText("멤버가 늘면 이번 달 남은 기간만큼 자동으로 결제되고", { exact: false })).toBeVisible();
  await expect(page.getByText(/· 멤버 추가 자동결제$/)).toBeVisible();
  await shot(page, "auto-seats-plan-orders");
});
