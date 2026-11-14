// Lane harness addresses come from the environment only. A built-in default
// once pointed at another session's harness (API 3308, PG 55438), so an unset
// value fails loudly instead of reaching someone else's server or database.
export function harnessEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: point it at this lane's harness (e2e has no default address)`);
  return value;
}

import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** The newest sign-up code the harness captured for `email` (prepix-backend
 *  scripts/workspaces-preview.cjs, /__test/mail). */
export async function signupCode(
  request: APIRequestContext,
  api: string,
  email: string,
): Promise<string> {
  let code = "";
  await expect
    .poll(async () => {
      const mail = (await (await request.get(`${api}/__test/mail`)).json()) as {
        to: string;
        code?: string;
      }[];
      code = mail.findLast((m) => m.to === email && m.code)?.code ?? "";
      return code;
    })
    .toBeTruthy();
  return code;
}

/** An API-registered account enters its code, as the code page would. */
export async function confirmSignupCode(
  request: APIRequestContext,
  api: string,
  email: string,
  headers: Record<string, string>,
) {
  const code = await signupCode(request, api, email);
  expect(
    (await request.post(`${api}/v2/auth/email/verify/code`, { headers, data: { code } })).status(),
  ).toBe(200);
}

/** After the sign-up form, or a sign-in that owes it: the code page, the mailed code, on. */
export async function enterSignupCode(page: Page, api: string, email: string) {
  await expect(page).toHaveURL(/\/verify-email/);
  await page.getByLabel("인증 코드").fill(await signupCode(page.request, api, email));
  await page.getByRole("button", { name: "확인", exact: true }).click();
}
