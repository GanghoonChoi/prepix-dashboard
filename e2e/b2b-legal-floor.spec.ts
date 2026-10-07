import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

// Legal floor (SOT: backend/docs/b2b-legal-floor.md): mid-term termination with
// withdrawal or pro-rata refunds, and renewal re-consent. Real Chrome, the real
// local Nest/JWT API on PostgreSQL and the local HTTP PG double; nothing here
// reaches a real PG. Time and usage are set in the disposable test database
// named by B2B_E2E_PG_CONTAINER (never a shared or real one).
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3745";
const double = process.env.B2B_E2E_PG_DOUBLE_URL ?? "http://127.0.0.1:3747";
const web = process.env.B2B_E2E_WEB_URL ?? "http://localhost:3746";
const opsKey = process.env.B2B_E2E_OPERATIONS_KEY ?? "local-preview-operations-key-0123456789";
const container = process.env.B2B_E2E_PG_CONTAINER;
const password = "LocalPreview123";
const buyer = {
  businessName: "로컬 해지 주식회사",
  businessRegistrationNumber: "1234567890",
  representative: "로컬 대표",
  address: "서울 로컬구 1",
  receiptEmail: "finance@example.test",
};
const uuid = /^[0-9a-f-]{36}$/;
function sql(query: string) {
  return execFileSync("docker", ["exec", container!, "psql", "-q", "-U", "prepix_test", "-d", "prepix_onboarding", "-Atc", query], { encoding: "utf8" }).trim();
}
async function account(request: APIRequestContext, prefix: string) {
  const email = `${prefix}-${randomUUID()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: prefix } })).status()).toBe(201);
  const session = (await (await request.post(`${api}/v2/auth/email/login`, { data: { email, password } })).json()).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  expect((await request.post(`${api}/v2/auth/email/verify/request`, { headers })).status()).toBe(200);
  let verifyUrl: string | undefined;
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      verifyUrl = mail.findLast((m: { to: string; verifyUrl?: string }) => m.to === email && m.verifyUrl)?.verifyUrl;
      return verifyUrl;
    })
    .toBeTruthy();
  expect((await request.post(`${api}/v2/auth/email/verify/confirm`, { data: { token: new URL(verifyUrl!).searchParams.get("token") } })).status()).toBe(200);
  return { email, id: session.user.id as string, headers };
}
async function payOrder(request: APIRequestContext, h: { Authorization: string }, base: string, orderId: string) {
  const checkout = (await (await request.get(`${base}/commerce/orders/${orderId}/checkout`, { headers: h })).json()).data;
  const back = await request.get(`${double}/checkout/approve?${new URLSearchParams({ clientKey: checkout.client.clientKey, orderId: checkout.providerOrderId, amount: String(checkout.amount), orderName: checkout.orderName, successUrl: `${web}/r`, failUrl: `${web}/f` })}`, { maxRedirects: 0 });
  const paymentKey = new URL(back.headers().location).searchParams.get("paymentKey");
  await request.post(`${base}/commerce/orders/${orderId}/confirm`, { headers: h, data: { paymentKey } });
  await expect
    .poll(async () => (await (await request.get(`${base}/commerce/orders/${orderId}`, { headers: h })).json()).data.order.state, { timeout: 30_000 })
    .toBe("applied");
}
/** A team with business details and a paid, applied first month. */
async function paidTeam(request: APIRequestContext, prefix: string) {
  test.skip(!container, "Set B2B_E2E_PG_CONTAINER to the disposable test database container");
  const owner = await account(request, prefix);
  const h = owner.headers;
  const created = await request.post(`${api}/v2/workspaces`, { headers: h, data: { name: "로컬 해지 팀", requestKey: randomUUID() } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).data.workspace.id as string;
  const base = `${api}/v2/workspaces/${id}/b2b`;
  const billing = (await (await request.get(`${base}/billing`, { headers: h })).json()).data;
  test.skip(!billing?.readiness?.billing, "Requires the preview harness with B2B_TEST_BILLING=true");
  const schemaVersion = billing.readiness.profileSchemaVersion as string;
  expect((await request.put(`${base}/billing/profile`, { headers: h, data: { requestKey: randomUUID(), revision: null, schemaVersion, ...buyer } })).status()).toBe(200);
  const product = (await (await request.get(`${base}/commerce`, { headers: h })).json()).data.product;
  const quote = (await (await request.post(`${base}/commerce/quotes`, { headers: h, data: { requestKey: randomUUID(), productVersion: product.version, target: "initial", renewal: "one_off", extraSeats: 0, aiPacks: 0, storagePacks: 0 } })).json()).data.quote;
  const order = (await (await request.post(`${base}/commerce/orders`, { headers: h, data: { requestKey: randomUUID(), quoteId: quote.id, buyer: { schemaVersion, ...buyer } } })).json()).data;
  await payOrder(request, h, base, order.orderId);
  return { owner, h, id, base, product, schemaVersion, orderId: order.orderId as string, total: quote.amounts.totalKrw as number };
}
/** The next month bought ahead (not started), optionally paid. */
async function nextMonth(request: APIRequestContext, t: Awaited<ReturnType<typeof paidTeam>>, pay: boolean) {
  const sourcePeriodId = sql(`select id from b2b_entitlement_periods where workspace_id = '${t.id}' and state = 'active'`);
  const quote = (await (await request.post(`${t.base}/commerce/quotes`, { headers: t.h, data: { requestKey: randomUUID(), productVersion: t.product.version, target: "next", renewal: "one_off", extraSeats: 0, aiPacks: 0, storagePacks: 0, sourcePeriodId } })).json()).data.quote;
  const order = (await (await request.post(`${t.base}/commerce/orders`, { headers: t.h, data: { requestKey: randomUUID(), quoteId: quote.id, buyer: { schemaVersion: t.schemaVersion, ...buyer } } })).json()).data;
  expect(order.orderId).toMatch(uuid);
  if (pay) await payOrder(request, t.h, t.base, order.orderId);
  return { orderId: order.orderId as string, total: quote.amounts.totalKrw as number };
}
const useService = (t: Awaited<ReturnType<typeof paidTeam>>) =>
  sql(`insert into b2b_editing_devices (id, workspace_id, user_id, public_key) values ('${randomUUID()}', '${t.id}', '${t.owner.id}', 'e2e-legal-floor-device-${randomUUID()}')`);
async function login(page: Page, email: string, path: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(path)}&locale=ko`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}
const won = (n: number) => `${new Intl.NumberFormat("ko-KR").format(n)}원`;
async function fits390(page: Page, shot: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(shot), fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1100 });
}

test("termination within the withdrawal period refunds everything; a lost reply is recovered by the same key with one termination; only confirmed money shows as refunded", async ({ page, request }) => {
  const t = await paidTeam(request, "legal-withdraw");
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const section = page.getByRole("region", { name: "중도해지" });
  await section.getByRole("button", { name: "해지 환불 금액 확인", exact: true }).click();
  const form = page.getByRole("form", { name: "중도해지 확인" });
  await expect(form.locator('[data-withdrawal="true"]')).toBeVisible();
  await expect(form.locator('[data-order-withdrawal="true"]')).toHaveCount(1);
  await expect(form.locator("[data-termination-total]")).toHaveText(won(t.total));
  const submit = form.getByRole("button", { name: `중도해지 · ${won(t.total)}`, exact: true });
  await form.getByLabel("해지 사유", { exact: true }).fill("팀 운영 종료");
  await expect(submit).toBeDisabled();
  await fits390(page, "termination-preview-390.png");
  await form.getByRole("checkbox", { name: new RegExp(`환불 예정 금액 ${won(t.total)}을 확인했고`) }).check();
  // The first reply is lost after the server applied it.
  const sent: string[] = [];
  const looked: string[] = [];
  await page.route(`${t.base}/billing/termination`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    sent.push(route.request().postDataJSON().requestKey);
    if (sent.length === 1) {
      await route.fetch();
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.route(`${t.base}/billing/operations/termination/**`, (route) => {
    looked.push(new URL(route.request().url()).pathname.split("/").at(-1)!);
    return route.continue();
  });
  await submit.click();
  const recover = section.getByRole("button", { name: "해지 요청 결과 확인", exact: true });
  await expect(recover).toBeVisible();
  await expect(section.getByRole("button", { name: "해지 환불 금액 확인", exact: true })).toHaveCount(0);
  await recover.click();
  const status = section.locator("[data-termination-status]");
  await expect(status).toBeVisible();
  await expect(recover).toHaveCount(0);
  expect(sent).toHaveLength(1);
  expect(looked).toEqual([sent[0]]);
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.termination).toMatchObject({ withdrawal: true, requestedTotalKrw: t.total, refundedKrw: 0, pendingKrw: t.total });
  expect(billing.termination.refunds).toHaveLength(1);
  // Reserved is not refunded: the money is "being confirmed", never "refunded".
  await expect(status.locator('[data-money="refunded"]')).toHaveText("0원");
  await expect(status.locator('[data-money="pending"]')).toHaveText(won(t.total));
  await expect(status.locator('[data-refund-state="reserved"]')).toContainText("환불 확인 중");
  await expect(status).toContainText("청약철회로 원주문 전액을 환불합니다.");
  await expect(page.getByText("열람·다운로드 가능", { exact: true })).toBeVisible();
  await expect(section.getByRole("button", { name: "해지 환불 금액 확인", exact: true })).toHaveCount(0);
  await fits390(page, "termination-reserved-390.png");
  // The operator approves; the provider confirms; only then is it refunded.
  const decided = await request.post(`${api}/v2/b2b/operations/refunds/${billing.termination.refunds[0].refundId}/decision`, {
    headers: { "x-b2b-operations-key": opsKey },
    data: { decision: "approve", operator: "local operator", reason: "로컬 승인", expectedTotalKrw: t.total },
  });
  expect((await decided.json()).data.refund.state).toBe("refunded");
  await page.reload();
  await expect(status.locator('[data-money="refunded"]')).toHaveText(won(t.total));
  await expect(status.locator('[data-money="pending"]')).toHaveCount(0);
  await expect(status.locator('[data-refund-state="refunded"]')).toContainText("환불 완료");
  // A second termination of the ended period is impossible.
  const again = await request.post(`${t.base}/billing/termination/preview`, { headers: t.h, data: {} });
  expect((await again.json()).message).toBe("B2B_TERMINATION_NOT_ACTIVE");
});

test("termination after the team has used the service refunds the unused time pro rata", async ({ page, request }) => {
  const t = await paidTeam(request, "legal-prorata");
  // Use: a registered editing device after the order took effect.
  useService(t);
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const section = page.getByRole("region", { name: "중도해지" });
  await section.getByRole("button", { name: "해지 환불 금액 확인", exact: true }).click();
  const form = page.getByRole("form", { name: "중도해지 확인" });
  await expect(form.locator('[data-withdrawal="false"]')).toContainText("미사용분 환불");
  await expect(form.locator('[data-order-withdrawal="false"]')).toContainText("미사용분 환불");
  await expect(form).not.toContainText("일할");
  await expect(form).not.toContainText("법정");
  await expect(form).not.toContainText("7일");
  await fits390(page, "termination-prorata-preview-390.png");
  const shown = Number((await form.locator("[data-termination-total]").innerText()).replace(/[^0-9]/g, ""));
  expect(shown).toBeGreaterThan(0);
  expect(shown).toBeLessThan(t.total);
  await form.getByLabel("해지 사유", { exact: true }).fill("편집 종료");
  await form.getByRole("checkbox", { name: /지금 팀 이용을 끝내는 데 동의합니다/ }).check();
  await form.getByRole("button", { name: `중도해지 · ${won(shown)}`, exact: true }).click();
  const status = section.locator("[data-termination-status]");
  await expect(status).toContainText("쓰지 않은 부분을 환불합니다.");
  await expect(status.locator('[data-money="pending"]')).toHaveText(won(shown));
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.termination).toMatchObject({ withdrawal: false, requestedTotalKrw: shown, refundedKrw: 0 });
  await fits390(page, "termination-prorata-390.png");
});

/** Automatic renewal consented under an older product version, then the
 * worker's re-consent requirement (it runs once a minute). */
async function consentRequired(request: APIRequestContext, t: Awaited<ReturnType<typeof paidTeam>>, oldBaseSupply: number) {
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  const start = (await (await request.post(`${t.base}/billing/methods/registrations`, { headers: t.h, data: { requestKey: randomUUID(), consentVersion: billing.readiness.autoPayConsentVersion } })).json()).data;
  const auth = await request.get(`${double}/billing-auth/approve?${new URLSearchParams({ clientKey: start.checkout.clientKey, customerKey: start.customerKey, successUrl: `${web}/r`, failUrl: `${web}/f` })}`, { maxRedirects: 0 });
  const authKey = new URL(auth.headers().location).searchParams.get("authKey");
  await request.post(`${t.base}/billing/methods/registrations/${start.methodId}/complete`, { headers: t.h, data: { requestKey: randomUUID(), customerKey: start.customerKey, authKey } });
  await expect
    .poll(async () => (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data.methods.some((m: { state: string }) => m.state === "active"))
    .toBe(true);
  const renewal = await request.put(`${t.base}/billing/renewal`, {
    headers: t.h,
    data: { requestKey: randomUUID(), revision: billing.renewal.revision, mode: "automatic", methodId: start.methodId, extraSeats: 0, aiPacks: 0, storagePacks: 0, retainedUserIds: [], consentVersion: billing.readiness.autoPayConsentVersion, productVersion: t.product.version },
  });
  expect(renewal.status()).toBe(200);
  const old = `e2e-legal-old-${randomUUID()}`;
  sql(`insert into b2b_product_versions (version, conditions_hash, conditions, created_at)
       select '${old}', md5('${old}'), jsonb_set(jsonb_set(conditions, '{version}', '"${old}"'), '{base,supplyKrw}', '${oldBaseSupply}'), now()
         from b2b_product_versions where version = '${t.product.version}'`);
  expect(sql(`update b2b_renewal_plans set consented_product_version = '${old}' where workspace_id = '${t.id}' returning mode`)).toBe("automatic");
  let consent: { id: string; state: string; reason: string; fromTotalKrw: number; toTotalKrw: number; shortNotice: boolean } | undefined;
  await expect
    .poll(async () => {
      consent = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data.renewalConsent ?? undefined;
      return consent?.state;
    }, { timeout: 150_000, intervals: [5_000] })
    .toBe("required");
  return { old, consent: consent! };
}

test("re-consent to a price increase: a changed total needs a fresh confirmation; accepting renews at the new version", async ({ page, request }) => {
  test.setTimeout(300_000);
  const t = await paidTeam(request, "legal-consent");
  const { old, consent } = await consentRequired(request, t, 80_000);
  expect(consent).toMatchObject({ reason: "price_increase", fromTotalKrw: 88_000, toTotalKrw: t.total, shortNotice: true });
  // The first view is stale: it still shows an older total.
  let stale = true;
  await page.route(`${t.base}/billing`, async (route) => {
    if (route.request().method() !== "GET" || !stale) return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if (body.data?.renewalConsent) body.data.renewalConsent.toTotalKrw = 99_000;
    return route.fulfill({ response, json: body });
  });
  const accepts: { requestKey: string; expectedTotalKrw: number; productVersion: string }[] = [];
  await page.route(`${t.base}/billing/renewal/consents/${consent.id}/accept`, (route) => {
    accepts.push(route.request().postDataJSON());
    stale = false;
    return route.continue();
  });
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const card = page.getByRole("region", { name: "갱신 금액 변경 · 동의가 필요합니다" });
  await expect(card).toContainText("다음 갱신 금액이 올라갑니다.");
  await expect(card.locator("[data-consent-product]")).toHaveText("상품 조건 변경");
  await expect(card).not.toContainText(old);
  await expect(card).not.toContainText(t.product.version);
  await expect(card.locator("[data-consent-total]")).toHaveText("88,000원 → 99,000원");
  await expect(card.locator("[data-short-notice]")).toBeVisible();
  const box = card.getByRole("checkbox", { name: /자동결제하는 데 동의합니다/ });
  await box.check();
  await card.getByRole("button", { name: "동의하고 갱신 · 99,000원", exact: true }).click();
  await expect(card).toContainText("갱신 금액이나 상품이 바뀌었습니다. 새 금액을 확인하고 다시 동의해 주세요.");
  await expect(card.locator("[data-consent-total]")).toHaveText(`88,000원 → ${won(t.total)}`);
  await expect(box).not.toBeChecked();
  const fresh = card.getByRole("button", { name: `동의하고 갱신 · ${won(t.total)}`, exact: true });
  await expect(fresh).toBeDisabled();
  await fits390(page, "consent-required-390.png");
  await box.check();
  await fresh.click();
  await expect(page.locator('[data-consent-state="consented"]')).toContainText(`바뀐 갱신 금액 ${won(t.total)}에 동의했습니다`);
  expect(accepts.map((a) => a.expectedTotalKrw)).toEqual([99_000, t.total]);
  expect(accepts.every((a) => a.productVersion === t.product.version && !("consentId" in a))).toBe(true);
  expect(new Set(accepts.map((a) => a.requestKey)).size).toBe(2);
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.renewalConsent.state).toBe("consented");
  expect(billing.renewal).toMatchObject({ mode: "automatic", consentedProductVersion: t.product.version, pausedReason: null });
  // The answer matters only until the charge time; the server keeps returning the
  // answered request forever, so after chargeAt the card must be gone.
  await page.route(`${t.base}/billing`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.data.serverTime = new Date(Date.parse(body.data.renewalConsent.chargeAt) + 1_000).toISOString();
    return route.fulfill({ response, json: body });
  });
  await page.reload();
  await expect(page.getByRole("region", { name: "중도해지" })).toBeVisible();
  await expect(page.locator("[data-consent-state]")).toHaveCount(0);
});

// (integration) E+ x H: no product on sale can have a 0-won base, and the
// per-seat rules refuse to read such a stored version, so "free to paid" has
// no reachable data. The 0-won earlier version made here by SQL is that case:
// the question still goes out, as changed terms with an unknown earlier total.
test("re-consent when the earlier version can't be read: not answerable before it opens; a lost decline is recovered by its key; the team ends with the period; other members see none of it", async ({ page, request }) => {
  test.setTimeout(300_000);
  const t = await paidTeam(request, "legal-decline");
  const { consent } = await consentRequired(request, t, 0);
  expect(consent).toMatchObject({ reason: "terms_changed", fromTotalKrw: null, toTotalKrw: t.total });
  // Before the window opens the card explains when, and offers no answer.
  await page.route(`${t.base}/billing`, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    if (body.data?.renewalConsent) body.data.renewalConsent.opensAt = new Date(Date.parse(body.data.serverTime) + 86_400_000).toISOString();
    return route.fulfill({ response, json: body });
  });
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const card = page.getByRole("region", { name: "갱신 금액 변경 · 동의가 필요합니다" });
  await expect(card).toContainText("다음 갱신의 상품 조건이 바뀝니다.");
  await expect(card).toContainText("확인 불가");
  await expect(card).toContainText("부터 답할 수 있습니다. 그 전의 동의는 인정되지 않습니다.");
  await expect(card.getByRole("button", { name: /동의하고 갱신/ })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /동의하지 않음/ })).toHaveCount(0);
  await page.unroute(`${t.base}/billing`);
  // The first decline reply is lost after the server applied it.
  const declines: string[] = [];
  const looked: string[] = [];
  await page.route(`${t.base}/billing/renewal/consents/${consent.id}/decline`, async (route) => {
    declines.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    return route.abort("failed");
  });
  await page.route(`${t.base}/billing/operations/renewal.consent.decline/**`, (route) => {
    looked.push(new URL(route.request().url()).pathname.split("/").at(-1)!);
    return route.continue();
  });
  await page.reload();
  await card.getByRole("button", { name: "동의하지 않음 · 기간 끝에 종료", exact: true }).click();
  // The server already answered; the lost reply stays checkable by its key.
  const recover = page.getByRole("button", { name: "거절 결과 확인", exact: true });
  await expect(recover).toBeVisible();
  await expect(page.getByRole("button", { name: /동의하고 갱신|동의하지 않음/ })).toHaveCount(0);
  await recover.click();
  await expect(page.locator('[data-consent-state="declined"]')).toContainText("바뀐 갱신 금액에 동의하지 않았습니다");
  expect(declines).toHaveLength(1);
  expect(declines[0]).toMatch(uuid);
  expect(looked).toEqual([declines[0]]);
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.renewal).toMatchObject({ mode: "one_off", pausedReason: "renewal_consent_declined" });
  await page.goto(`/dashboard/workspaces/${t.id}/plan/settings`);
  await expect(page.getByText("바뀐 갱신 금액에 동의하지 않음 · 이번 기간 끝에 종료", { exact: false })).toBeVisible();
  await fits390(page, "consent-declined-settings-390.png");
  // A participant without billing authority sees none of it.
  const member = await account(request, "legal-member");
  expect((await request.post(`${t.base}/invitations`, { headers: t.h, data: { requestKey: randomUUID(), email: member.email, kind: "internal", teamRole: "editor", canDownload: false } })).status()).toBe(201);
  let invite: string | undefined;
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      invite = mail.findLast((m: { to: string; inviteUrl?: string }) => m.to === member.email && m.inviteUrl?.includes("/b2b-invitations/"))?.inviteUrl;
      return invite;
    })
    .toBeTruthy();
  expect((await request.post(`${api}/v2/b2b/invitations/${new URL(invite!).pathname.split("/").at(-1)}/accept`, { headers: member.headers })).status()).toBe(201);
  await page.evaluate(() => localStorage.clear());
  await login(page, member.email, `/dashboard/workspaces/${t.id}/plan`);
  await expect(page).toHaveURL(new RegExp(`/workspaces/${t.id}/plan`));
  await expect(page.getByText(/결제 권한/).first()).toBeVisible();
  await expect(page.getByText("중도해지")).toHaveCount(0);
  await expect(page.getByText(/갱신 금액/)).toHaveCount(0);
  expect((await request.post(`${t.base}/billing/termination/preview`, { headers: member.headers, data: {} })).status()).toBe(403);
});

test("termination refused while a payment is in progress shows termination copy, drops the preview and keeps nothing pending", async ({ page, request }) => {
  const t = await paidTeam(request, "legal-paying");
  await nextMonth(request, t, false); // a live checkout, not paid
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const section = page.getByRole("region", { name: "중도해지" });
  await section.getByRole("button", { name: "해지 환불 금액 확인", exact: true }).click();
  const form = page.getByRole("form", { name: "중도해지 확인" });
  // The server refuses either at the preview or at the submit; both show termination copy.
  const previewed = await form.waitFor({ timeout: 5_000 }).then(() => true, () => false);
  if (previewed) {
    await form.getByLabel("해지 사유", { exact: true }).fill("결제 중 해지");
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: /^중도해지/ }).click();
  }
  const alert = section.getByRole("alert");
  await expect(alert).toContainText("진행 중인 결제가 끝난 뒤 해지 금액을 다시 확인해 주세요.");
  await expect(alert).not.toContainText("다시 결제하지 마세요");
  await expect(form).toHaveCount(0);
  await expect(section.getByRole("button", { name: "해지 요청 결과 확인", exact: true })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "해지 환불 금액 확인", exact: true })).toBeVisible();
  expect((await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data.termination).toBeNull();
});

test("a period bought ahead is refunded in full and each order is labelled by what the server says, never as pro rata; orders are named by payment date", async ({ page, request }) => {
  const t = await paidTeam(request, "legal-prebought");
  useService(t);
  const ahead = await nextMonth(request, t, true);
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const section = page.getByRole("region", { name: "중도해지" });
  await section.getByRole("button", { name: "해지 환불 금액 확인", exact: true }).click();
  const form = page.getByRole("form", { name: "중도해지 확인" });
  const rows = form.locator("[data-order-withdrawal]");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: won(ahead.total) })).toHaveCount(1);
  // The server decides the basis per order: the used first month is the unused part,
  // the month bought ahead comes back whole (withdrawal). The screen only repeats it.
  await expect(rows.filter({ hasText: won(ahead.total) })).toContainText("청약철회 전액");
  await expect(rows.filter({ hasNotText: won(ahead.total) })).toContainText("미사용분 환불");
  await expect(rows.first()).toContainText("결제");
  await expect(form).not.toContainText("일할");
  await expect(form).not.toContainText(ahead.orderId.slice(0, 8));
  await fits390(page, "termination-prebought-390.png");
  await form.getByLabel("해지 사유", { exact: true }).fill("선구매 포함 해지");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: /^중도해지 ·/ }).click();
  const status = section.locator("[data-termination-status]");
  await expect(status.locator("[data-refund-state]")).toHaveCount(2);
  await expect(status.getByRole("link", { name: /^주문 보기/ })).toHaveCount(2);
  await expect(status).not.toContainText(ahead.orderId.slice(0, 8));
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.termination.refunds.find((r: { orderId: string }) => r.orderId === ahead.orderId).totalKrw).toBe(ahead.total);
});

test("a termination with nothing to refund says so, asks for no amount and ends the team", async ({ page, request }) => {
  const t = await paidTeam(request, "legal-zero");
  useService(t);
  await login(page, t.owner.email, `/dashboard/workspaces/${t.id}/plan`);
  const section = page.getByRole("region", { name: "중도해지" });
  const open = section.getByRole("button", { name: "해지 환불 금액 확인", exact: true });
  await expect(open).toBeVisible();
  // The period is nearly over (ends in 10 seconds): the unused part rounds to 0 won.
  sql(`set session_replication_role = replica;
       update b2b_entitlement_applications set effective_at = now() + interval '10 seconds' - interval '30 days' where workspace_id = '${t.id}';
       update b2b_entitlement_periods set starts_at = now() + interval '10 seconds' - interval '30 days', ends_at = now() + interval '10 seconds' where workspace_id = '${t.id}' and state = 'active';
       update b2b_teams set period_ends_at = now() + interval '10 seconds' where workspace_id = '${t.id}'`);
  await open.click();
  const form = page.getByRole("form", { name: "중도해지 확인" });
  await expect(form.locator('[data-zero="true"]')).toContainText("돌려드릴 금액이 없습니다. 해지하면 지금 이용이 끝납니다.");
  await expect(form.locator("[data-order-withdrawal]")).toHaveCount(0);
  await form.getByLabel("해지 사유", { exact: true }).fill("기간 끝 무렵 해지");
  await form.getByRole("checkbox", { name: /환불받을 금액이 없음을 확인했고/ }).check();
  await fits390(page, "termination-zero-390.png");
  await form.getByRole("button", { name: "중도해지", exact: true }).click();
  const status = section.locator("[data-termination-status]");
  await expect(status).toContainText("돌려드릴 금액이 없어 환불 없이 해지했습니다.");
  await expect(status.locator("[data-money]")).toHaveCount(0);
  await expect(status.locator("[data-refund-state]")).toHaveCount(0);
  const billing = (await (await request.get(`${t.base}/billing`, { headers: t.h })).json()).data;
  expect(billing.termination).toMatchObject({ requestedTotalKrw: 0, refundedKrw: 0, pendingKrw: 0, refunds: [] });
});
