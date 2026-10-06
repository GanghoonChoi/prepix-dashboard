import { test, expect } from "@playwright/test";
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3308",
  password = "LocalPreview123";
test("team purchase quote preserves a lost response, separates VAT and per-seat AI, sells no extra AI, and never grants on quote", async ({
  page,
  request,
}) => {
  const email = `commerce-${crypto.randomUUID()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "commerce" },
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
  const created = await request.post(`${api}/v2/workspaces`, {
    headers,
    data: { name: "로컬 견적 확인", requestKey: crypto.randomUUID() },
  });
  expect(created.status()).toBe(201);
  const workspace = (await created.json()).data.workspace;
  const commerce = (
    await (
      await request.get(`${api}/v2/workspaces/${workspace.id}/b2b/commerce`, {
        headers,
      })
    ).json()
  ).data;
  test.skip(
    !commerce.configured,
    "Requires B2B_TEST_NEW_TEAMS=true B2B_TEST_PRODUCT=true local harness",
  );
  await page.goto(
    `/login?returnTo=${encodeURIComponent(`/dashboard/workspaces/${workspace.id}/plan`)}&locale=ko`,
  );
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(
    page.getByText("로컬 검증용 팀 상품", { exact: true }),
  ).toBeVisible();
  // Per seat: AI per seat is shown, and AI is never sold on its own.
  await expect(page.getByText("좌석당 AI", { exact: true })).toBeVisible();
  await expect(page.getByLabel("추가 AI 팩")).toHaveCount(0);
  await page.getByLabel("추가 편집 이용권", { exact: true }).fill("2");
  await page.getByLabel("저장 추가 팩", { exact: true }).fill("1");
  let original: unknown,
    quoteId = "",
    requests = 0;
  await page.route(
    `${api}/v2/workspaces/${workspace.id}/b2b/commerce/quotes`,
    async (route) => {
      const input = route.request().postDataJSON();
      if (requests++ === 0) {
        original = input;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        const quote = (await response.json()).data.quote;
        expect(input.aiPacks).toBe(0);
        expect(quote.allowances.seats).toBe(5);
        expect(quote.allowances.periodAiUnits).toBe(5 * 3000);
        expect(quote.allowances.extraAiUnits).toBe(0);
        expect(quote.amounts).toEqual({
          supplyKrw: 130000,
          vatKrw: 13000,
          totalKrw: 143000,
          currency: "KRW",
        });
        quoteId = quote.id;
        return route.abort("failed");
      }
      expect(input).toEqual(original);
      return route.continue();
    },
  );
  await page.getByRole("button", { name: "견적 확인", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "같은 견적 다시 확인", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("추가 편집 이용권", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "갱신 방식", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "같은 견적 다시 확인", exact: true })
    .click();
  const quoted = page.getByRole("region", { name: "확인한 견적", exact: true });
  await expect(quoted.getByText("143,000원", { exact: true })).toBeVisible();
  await page.screenshot({ path: `${process.env.B2B_E2E_SHOTS ?? "/tmp"}/purchase-per-seat.png`, fullPage: true });
  await expect(quoted.getByText("13,000원", { exact: true })).toBeVisible();
  await expect(quoted.getByText(/좌석 AI 3,000 검증 단위 × 좌석 수 · 합계 15,000 검증 단위/)).toBeVisible();
  expect(
    (
      await request.post(`${api}/v2/workspaces/${workspace.id}/b2b/commerce/quotes`, {
        headers,
        data: { ...(original as object), requestKey: crypto.randomUUID(), aiPacks: 1 },
      })
    ).status(),
  ).toBe(422);
  await expect(
    page.getByRole("button", { name: "결제하기", exact: true }),
  ).toHaveCount(0);
  const saved = (
    await (
      await request.get(
        `${api}/v2/workspaces/${workspace.id}/b2b/commerce/quotes/${quoteId}`,
        { headers },
      )
    ).json()
  ).data;
  expect(saved.quote.id).toBe(quoteId);
  expect(saved.quote.conditions.aiUnitLabel).toBe("검증 단위");
  const status = (
    await (
      await request.get(`${api}/v2/workspaces/${workspace.id}/b2b/status`, {
        headers,
      })
    ).json()
  ).data;
  expect(status.team.periodEndsAt).toBeNull();
  await page.getByLabel("추가 편집 이용권", { exact: true }).fill("3");
  await expect(quoted).toHaveCount(0);
});
