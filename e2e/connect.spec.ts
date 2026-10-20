import { test, expect, type Page } from "@playwright/test";

// The desktop sign-in ends on this page and hands the app a one-time code on
// its own `prepix://` link. No harness: the two endpoints are answered here.
const state = "s".repeat(32);
const challenge = "c".repeat(43);
const connect = `/connect?${new URLSearchParams({
  redirect_uri: "prepix://auth/callback",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
  locale: "ko",
})}`;

async function serve(page: Page) {
  const asked: unknown[] = [];
  await page.route(/\/v2\/auth\/me$/, (route) =>
    route.fulfill({ json: { data: { id: "u1", email: "maker@example.test" } } }),
  );
  await page.route(/\/v2\/auth\/device\/authorize$/, (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { data: { code: "one-time-code", expiresIn: 120 } } });
  });
  return asked;
}

const signIn = (page: Page) =>
  page.evaluate(() => {
    localStorage.setItem("userInfo", JSON.stringify({ id: "u1" }));
    localStorage.setItem("accessToken", "access");
    localStorage.setItem("refreshToken", "refresh");
  });

const openApp = (page: Page) => page.getByRole("link", { name: "Prepix 열기" });
const callback = `prepix://auth/callback?code=one-time-code&state=${state}`;

test("already signed in: shows the account, continues once, then offers to open the app", async ({ page }) => {
  const asked = await serve(page);
  await page.goto("/login?locale=ko");
  await signIn(page);
  await page.goto(connect);

  await expect(page.getByText("maker@example.test")).toBeVisible();
  expect(asked).toHaveLength(0);
  await page.getByRole("button", { name: "계속", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Prepix 앱으로 돌아가세요" })).toBeVisible();
  await expect(openApp(page)).toHaveAttribute("href", callback);
  expect(asked).toEqual([expect.objectContaining({ codeChallenge: challenge })]);
});

test("signed in on this request: no second question", async ({ page }) => {
  const asked = await serve(page);
  await page.goto(connect);
  await page.waitForURL(/\/login/);
  const returnTo = new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo).toBe(connect);

  await signIn(page);
  await page.goto(returnTo!);

  await expect(openApp(page)).toHaveAttribute("href", callback);
  expect(asked).toHaveLength(1);
});

test("a link that is not the app's own is refused", async ({ page }) => {
  await page.goto(connect.replace(encodeURIComponent("prepix://auth/callback"), encodeURIComponent("https://evil.test/cb")));
  await expect(page.getByRole("heading", { name: "사용할 수 없는 링크입니다" })).toBeVisible();
});
