import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { harnessEnv } from "./harness-env";

// 결제내역 + Prepix 영수증 (2026-10-13). The harness has no billing module, so
// the subscription endpoints are answered here with the shapes the backend
// serves; sign-in and the dashboard are real.
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";

async function account(request: APIRequestContext) {
  const email = `receipts-${crypto.randomUUID()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: "receipts" } })).status()).toBe(201);
  return email;
}
async function login(page: Page, email: string, path: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}

const kakao = {
  id: "11111111-1111-4111-8111-111111111111",
  receiptNo: "PX261012-W5LBRB",
  provider: "portone",
  plan: "creator",
  interval: "month",
  amount: 39920,
  supplyAmount: 36291,
  vatAmount: 3629,
  currency: "KRW",
  status: "cancelled",
  cancelledAmount: 39920,
  method: "kakaopay",
  cardCompany: "농협카드",
  cardNumber: "543017******",
  approvalNo: "30012345",
  periodStart: "2026-10-12T09:43:46Z",
  periodEnd: "2026-11-12T09:43:46Z",
  paidAt: "2026-10-12T09:43:46Z",
  cancelledAt: "2026-10-12T10:03:59Z",
  hasPgReceipt: true,
};
const card = {
  ...kakao,
  id: "22222222-2222-4222-8222-222222222222",
  receiptNo: "PX261001-K7Q2MZ",
  provider: "tosspayments",
  amount: 49900,
  supplyAmount: 45364,
  vatAmount: 4536,
  status: "paid",
  cancelledAmount: 0,
  method: "card",
  cardCompany: "농협",
  cardNumber: "54301712****123*",
  approvalNo: "00941877",
  paidAt: "2026-10-01T05:49:11Z",
  cancelledAt: null,
};

test("결제내역 lists each payment with its own receipt and the card slip; the receipt prints alone", async ({ page, request }) => {
  const email = await account(request);
  const slips: string[] = [];
  await page.route(/\/v2\/subscriptions\/(current|plans)$/, (route) =>
    route.fulfill({ json: { data: route.request().url().endsWith("/plans") ? [] : null } }),
  );
  await page.route(/\/v2\/subscriptions\/payments$/, (route) => route.fulfill({ json: { data: { payments: [kakao, card] } } }));
  await page.route(/\/v2\/subscriptions\/payments\/[^/]+\/pg-receipt$/, (route) => {
    slips.push(route.request().url());
    return route.fulfill({ json: { data: { url: "https://slip.example.test/kakao", verification: false } } });
  });
  await page.route(/\/v2\/subscriptions\/payments\/[^/]+$/, (route) =>
    route.fulfill({
      json: {
        data: {
          ...(route.request().url().endsWith(card.id) ? card : kakao),
          buyer: { email },
          merchant: {
            name: "주식회사 라스커",
            representative: "유수진",
            businessNo: "407-81-33448",
            address: "대전광역시 유성구 문지로 193 (문지동), KAIST 문지캠퍼스 진리관 236호",
            phone: "050-6545-1805",
            email: "support@prepix.ai",
          },
        },
      },
    }),
  );
  await page.context().route("https://slip.example.test/**", (route) => route.fulfill({ body: "<title>slip</title>card slip", contentType: "text/html" }));

  await login(page, email, "/dashboard/plan?locale=ko");
  // 결제내역 is the second tab of 플랜과 결제.
  await page.getByRole("link", { name: "결제내역", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/plan\/payments$/);
  const history = page.getByRole("region", { name: "결제내역" });
  await expect(history.locator(`[data-payment="${kakao.receiptNo}"]`)).toContainText("취소완료");
  await expect(history.locator(`[data-payment="${kakao.receiptNo}"]`)).toContainText("카카오페이 · 승인번호 30012345");
  await expect(history.locator(`[data-payment="${card.receiptNo}"]`)).toContainText("결제완료");
  // A Toss slip asks the buyer to confirm; the page says so before they click.
  await expect(history).toContainText("본인 확인이 필요할 수 있어요");

  // The card company's slip: fetched for this account, opened in a new tab.
  const [tab] = await Promise.all([
    page.context().waitForEvent("page"),
    history.locator(`[data-payment="${kakao.receiptNo}"]`).getByRole("button", { name: /카드 매출전표/ }).click(),
  ]);
  await tab.waitForURL("https://slip.example.test/kakao");
  expect(slips).toEqual([expect.stringContaining(`/payments/${kakao.id}/pg-receipt`)]);
  await tab.close();

  // Prepix's own receipt: no verification, issuer printed, refund stated.
  await history.locator(`[data-payment="${card.receiptNo}"]`).getByRole("link", { name: "영수증" }).click();
  const receipt = page.getByRole("article", { name: "영수증" });
  await expect(receipt).toContainText(card.receiptNo);
  await expect(receipt).toContainText("Prepix Creator 월간 구독");
  await expect(receipt).toContainText("45,364원");
  await expect(receipt).toContainText("4,536원");
  await expect(receipt).toContainText("승인번호");
  await expect(receipt).toContainText("407-81-33448");
  await expect(receipt).toContainText(email);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: /인쇄 · PDF 저장/ })).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.goto(`/dashboard/plan/receipts/${kakao.id}`);
  await expect(page.getByRole("article", { name: "영수증" })).toContainText("39,920원 환불되었습니다");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
