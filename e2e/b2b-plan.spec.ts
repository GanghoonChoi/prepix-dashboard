import { test, expect } from "@playwright/test";
import { api, account, allMail, json, shot } from "./b2b-review-helpers";

// 플랜과 결제, one page (2026-10-12): checkout turns on renewal and
// 멤버 추가 자동결제 with one consent; seats are then bought by themselves;
// invoice details and the card change from their own line; 해지 keeps the
// period and stops the next payment. Real Chrome, local API and PostgreSQL,
// the PG double for every charge. Requires the preview harness with
// B2B_TEST_NEW_TEAMS, B2B_TEST_PRODUCT and B2B_TEST_BILLING.
const double = process.env.B2B_E2E_PG_DOUBLE_URL ?? "http://127.0.0.1:3547";
const buyer = { businessName: "로컬 결제 주식회사", businessRegistrationNumber: "1234567890", representative: "로컬 대표", address: "서울 로컬구 1", contactPhone: "010-1234-5678" };

test("plan and billing: one consent at checkout, seats bought by themselves, details and card from their line, cancel keeps the period", async ({ page, request }) => {
  test.setTimeout(240_000);
  const owner = await account(request, "plan-owner");
  const id = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "플랜 화면 팀", requestKey: crypto.randomUUID() } }))).workspace.id as string;
  const base = `${api}/v2/workspaces/${id}/b2b`, h = owner.headers;
  test.skip(!(await json(request.get(`${base}/billing`, { headers: h }))).readiness?.billing, "Requires the preview harness with B2B_TEST_BILLING=true");

  await page.goto(`/login?returnTo=${encodeURIComponent(`/dashboard/workspaces/${id}/plan`)}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(owner.email);
  await page.getByLabel("비밀번호", { exact: true }).fill("LocalPreview123");
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  // Unpaid: the plan and the checkout, nothing else to look at.
  const checkout = page.getByTestId("business-checkout");
  await expect(checkout).toBeVisible();
  await expect(page.getByRole("heading", { name: "결제 수단" })).toHaveCount(0);
  await expect(page.getByText("중도해지")).toHaveCount(0);
  await checkout.getByLabel("상호", { exact: true }).fill(buyer.businessName);
  await checkout.getByLabel("사업자등록번호", { exact: true }).fill(buyer.businessRegistrationNumber);
  await checkout.getByLabel("대표자", { exact: true }).fill(buyer.representative);
  await checkout.getByLabel("사업장 주소", { exact: true }).fill(buyer.address);
  await checkout.getByLabel("수신 연락처", { exact: true }).fill(buyer.contactPhone);
  await checkout.getByRole("checkbox", { name: /멤버가 늘면 이번 기간에 남은 날만큼 바로 결제하는 데 동의합니다/ }).check();
  await checkout.getByRole("button", { name: /카드 등록하고 .*원 결제/ }).click();
  await page.waitForURL(`${double}/billing-auth?**`);
  await page.getByRole("link", { name: "카드 등록 완료" }).click();
  await page.waitForURL(`**/plan?registration=**`);
  await expect.poll(async () => (await json(request.get(`${base}/commerce/orders`, { headers: h }))).items[0]?.state, { timeout: 60_000 }).toBe("applied");
  const billing = await json(request.get(`${base}/billing`, { headers: h }));
  expect(billing.renewal.mode).toBe("automatic");
  expect(billing.renewal.autoSeats?.by).toBe(owner.id);

  await page.goto(`/dashboard/workspaces/${id}/plan`);
  const plan = page.getByRole("region", { name: "Business" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Business", exact: true }) })).first();
  await expect(plan).toContainText("이용 중");
  await expect(plan).toContainText("3석");
  await expect(plan).toContainText("남은 기간만큼 바로 자동결제");
  await expect(plan).toContainText(/다음 결제\s*\d+월 \d+일/);
  await expect(page.getByText("수신 연락처")).toBeVisible();
  await expect(page.getByText("갱신 방식")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await shot(page, "plan-active");

  // Three editors join; the third is one too many and is bought a seat.
  for (let i = 0; i < 3; i++) {
    const p = await account(request, `plan-ed${i}`);
    expect((await request.post(`${base}/invitations`, { headers: h, data: { requestKey: crypto.randomUUID(), email: p.email, kind: "internal", teamRole: "editor", assignSeat: true } })).status()).toBe(201);
    let url = "";
    await expect.poll(async () => (url = (await allMail(request)).findLast((m: { to: string; inviteUrl?: string }) => m.to === p.email && m.inviteUrl?.includes("/b2b-invitations/"))?.inviteUrl ?? ""), { timeout: 30_000 }).toBeTruthy();
    expect((await request.post(`${api}/v2/b2b/invitations/${new URL(url).pathname.split("/").at(-1)}/accept`, { headers: p.headers })).status()).toBe(201);
  }
  await expect.poll(async () => (await json(request.get(`${base}/members`, { headers: h }))).seats, { timeout: 90_000, intervals: [2000] }).toEqual({ capacity: 4, assigned: 4, waiting: 0 });
  await page.reload();
  await expect(plan).toContainText("4석");
  const payments = page.locator("section", { has: page.getByRole("heading", { name: "결제 내역" }) });
  await expect(payments).toContainText("현재 기간 추가");
  await expect(payments).toContainText("첫 한 달");

  // Invoice details: read here, edited in a dialog.
  const invoice = page.locator("section", { has: page.getByRole("heading", { name: "세금계산서 정보" }) });
  await invoice.getByRole("button", { name: "수정", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "세금계산서 정보" });
  await expect(edit.getByLabel("수신 연락처", { exact: true })).toHaveValue("010-1234-5678");
  await edit.getByLabel("수신 연락처", { exact: true }).fill("02 123 4567");
  await edit.getByRole("button", { name: "저장", exact: true }).click();
  await expect(edit).toHaveCount(0);
  await expect(invoice).toContainText("02-123-4567");
  expect((await json(request.get(`${base}/billing`, { headers: h }))).profile).toMatchObject({ contactPhone: "021234567" });

  // The card changes through the same window, back to this page.
  const card = page.locator("section", { has: page.getByRole("heading", { name: "결제 수단" }) });
  await card.getByRole("button", { name: "변경", exact: true }).click();
  const change = page.getByRole("dialog", { name: "카드 변경" });
  await change.getByRole("checkbox").check();
  await change.getByRole("button", { name: "카드 입력", exact: true }).click();
  await page.waitForURL(`${double}/billing-auth?**`);
  await page.getByRole("link", { name: "카드 등록 완료" }).click();
  await page.waitForURL(`**/plan?registration=**`);
  await expect(page.getByText("카드를 등록했어요.")).toBeVisible({ timeout: 30_000 });

  // 해지: the period stays, the next payment does not happen; then resume.
  await page.getByRole("region", { name: "구독 해지" }).getByRole("button", { name: "구독 해지" }).click();
  const cancel = page.getByRole("dialog", { name: "구독을 해지할까요?" });
  await shot(page, "plan-cancel");
  await cancel.getByRole("button", { name: "구독 해지", exact: true }).click();
  await expect(cancel).toHaveCount(0);
  await expect(plan).toContainText("해지 예정");
  await expect(plan).toContainText("자동결제가 꺼져 있어요.");
  expect((await json(request.get(`${base}/billing`, { headers: h }))).renewal.mode).toBe("one_off");
  await plan.getByRole("button", { name: "구독 다시 시작" }).click();
  const resume = page.getByRole("dialog", { name: "구독 다시 시작" });
  const go = resume.getByRole("button", { name: "다시 시작", exact: true });
  await expect(go).toBeDisabled();
  await resume.getByRole("checkbox").check();
  await go.click();
  await expect(resume).toHaveCount(0);
  await expect(plan).toContainText("이용 중");
  const after = (await json(request.get(`${base}/billing`, { headers: h }))).renewal;
  expect(after.mode).toBe("automatic");
  expect(after.autoSeats).toBeTruthy();
  await shot(page, "plan-resumed");

  // The monthly statements are one link away, with the way back.
  await payments.getByRole("link", { name: "월 이용명세서" }).click();
  await expect(page.getByRole("heading", { name: "월 이용명세서" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /플랜과 결제/ })).toBeVisible();
  // One column on a phone, nothing wider than the screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/workspaces/${id}/plan`);
  await expect(plan).toContainText("이용 중");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "plan-390");
});
