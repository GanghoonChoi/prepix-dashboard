import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Local acceptance only: the backend preview harness with B2B_TEST_ENABLED,
// TEAM_TEST_STORAGE, B2B_TEST_FILES (ClamD protocol double, real ffprobe) and
// B2B_TEST_PREVIEW (real ffmpeg worker step), an explicit
// WORKSPACES_TEST_DATABASE_URL and B2B_E2E_MEDIA_DIR with cut-v1.mp4,
// cut-v2.mp4 (6 s) and long-cut.mp4 (10 s, above the 8 s local limit).
export const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3518";
export const media = process.env.B2B_E2E_MEDIA_DIR ?? "";
export const password = "LocalPreview123";
export type Account = Awaited<ReturnType<typeof account>>;

export async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: label },
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
  await request.post(`${api}/v2/auth/email/verify/request`, { headers });
  let verifyUrl = "";
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      verifyUrl =
        mail.findLast(
          (m: { to: string; verifyUrl?: string }) =>
            m.to === email && m.verifyUrl,
        )?.verifyUrl ?? "";
      return verifyUrl;
    })
    .toBeTruthy();
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/confirm`, {
        data: { token: new URL(verifyUrl).searchParams.get("token") },
      })
    ).status(),
  ).toBe(200);
  return { email, headers, id: session.user.id as string, label };
}
export function fixture(script: string, input: object) {
  expect(process.env.WORKSPACES_TEST_DATABASE_URL).toBeTruthy();
  execFileSync(
    process.execPath,
    [
      resolve(
        process.env.B2B_E2E_FIXTURE_DIR ?? "../prepix-backend/backend/scripts",
        script,
      ),
      JSON.stringify(input),
    ],
    { timeout: 15_000 },
  );
}
// Local harnesses that share one database share its invitation queue, so a
// queued invitation can be delivered into any of their mailboxes.
const mailboxes = (process.env.B2B_E2E_MAILBOXES ?? `${api}/__test/mail`).split(",");
const allMail = async (request: APIRequestContext) =>
  (await Promise.all(mailboxes.map((url) => request.get(url).then((r) => r.json()).catch(() => [])))).flat();
export async function invite(
  request: APIRequestContext,
  lead: Account,
  team: string,
  projectId: string | null,
  user: Account,
  kind: "internal" | "external",
  role: "producer" | "reviewer",
) {
  const known = new Set(
    (await allMail(request)).map((m: { inviteUrl?: string }) => m.inviteUrl),
  );
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team}/b2b/invitations`, {
        headers: lead.headers,
        data: {
          requestKey: randomUUID(),
          email: user.email,
          kind,
          teamRole: role === "reviewer" ? "reviewer" : "editor",
          // null: a team-only invitation (the inviter must be a manager).
          ...(projectId ? { projectId, projectRole: role, canDownload: false } : {}),
        },
      })
    ).status(),
  ).toBe(201);
  let inviteUrl = "";
  await expect
    .poll(
      async () => {
        const mail = await allMail(request);
        inviteUrl =
          mail.findLast(
            (m: { to: string; inviteUrl?: string }) =>
              m.to === user.email &&
              m.inviteUrl?.includes("/b2b-invitations/") &&
              !known.has(m.inviteUrl),
          )?.inviteUrl ?? "";
        return inviteUrl;
      },
      { timeout: 30_000 },
    )
    .toBeTruthy();
  const token = new URL(inviteUrl).pathname.split("/").at(-1);
  expect(
    (
      await request.post(`${api}/v2/b2b/invitations/${token}/accept`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(201);
}
export async function open(browser: Browser, user: Account, target: string) {
  const context = await browser.newContext({ locale: "ko-KR" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
      errors.push(m.text());
  });
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  return { page, errors, close: () => context.close() };
}
export async function upload(page: Page, name: string, newVersionOf?: string) {
  await expect(
    page.getByRole("heading", { name: "폴더 자료", exact: true }),
  ).toBeVisible();
  if (newVersionOf)
    await page
      .getByRole("combobox", { name: "등록 방식", exact: true })
      .selectOption({ label: `기존 자료의 새 버전: ${newVersionOf}` });
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name,
    mimeType: "video/mp4",
    buffer: await readFile(resolve(media, name)),
  });
  await page.getByRole("button", { name: "팀에 보관 시작", exact: true }).click();
}
export async function videoReady(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator("video")
          .evaluate((v: HTMLVideoElement) => v.readyState)
          .catch(() => 0),
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(2);
}
const shots = process.env.B2B_E2E_SHOTS;
export async function shot(page: Page, name: string) {
  if (shots) await page.screenshot({ path: resolve(shots, `${name}.png`), fullPage: true });
}
export const json = async (r: Promise<import("@playwright/test").APIResponse>) =>
  (await (await r).json()).data;

