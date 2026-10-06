import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Local only: the preview API (scripts/workspaces-preview.cjs with B2B_TEST_AI)
// on real PostgreSQL/MinIO/ffprobe; the AI provider is the local HTTP double.
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3312";
const double = process.env.B2B_E2E_AI_DOUBLE_URL ?? "http://127.0.0.1:3952";
const password = "LocalPreview123";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const wav = (ms: number, seed: number) => {
  const bytes = Buffer.alloc(44 + ms * 16);
  for (let i = 44; i < bytes.length; i++) bytes[i] = (i * seed) & 0xff;
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(ms * 16, 40);
  return bytes;
};
async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  expect((await request.post(`${api}/v2/auth/register`, { data: { email, password, username: label } })).status()).toBe(201);
  const session = (await (await request.post(`${api}/v2/auth/email/login`, { data: { email, password } })).json()).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  expect((await request.post(`${api}/v2/auth/email/verify/request`, { headers })).status()).toBe(200);
  let message: { verifyUrl: string } | undefined;
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${api}/__test/mail`)).json();
      message = mailbox.findLast((m: { to: string; verifyUrl?: string }) => m.to === email && m.verifyUrl);
      return message?.verifyUrl;
    })
    .toBeTruthy();
  expect(
    (await request.post(`${api}/v2/auth/email/verify/confirm`, { data: { token: new URL(message!.verifyUrl).searchParams.get("token") } })).status(),
  ).toBe(200);
  return { email, headers, id: session.user.id as string };
}
async function login(page: Page, email: string, target: string) {
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target));
}
const mode = (request: APIRequestContext, value: object) =>
  request.post(`${double}/__double/mode`, { data: value });

test("S30: registered input, quote, explicit run, response loss, refresh, verified result, account switch and failed checks", async ({ page, request }) => {
  test.setTimeout(240000);
  await mode(request, { transcript: "ok", pollsUntilDone: 1, completeLimit: null, durationOffsetMs: 0 });
  const owner = await account(request, "ai-run-owner"),
    other = await account(request, "ai-run-other");
  const team = (await (await request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "팀 AI 실행 검증", requestKey: randomUUID() } })).json()).data.workspace;
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const { periodId } = JSON.parse(
    execFileSync(process.execPath, [resolve("../prepix-backend/backend/scripts/b2b-paid-test-fixture.cjs"), JSON.stringify({ workspaceId: team.id, action: "purchase", target: "initial" })], { encoding: "utf8", timeout: 15000 }),
  );
  // Host-stamped period start vs PostgreSQL time: give the DB clock a moment.
  await new Promise((r) => setTimeout(r, 300));
  expect((await request.post(`${endpoint}/licences/assignments`, { headers: owner.headers, data: { requestKey: randomUUID(), periodId, userId: owner.id, limitUnits: 50 } })).status()).toBe(201);
  const project = (await (await request.post(`${endpoint}/projects`, { headers: owner.headers, data: { requestKey: randomUUID(), name: "AI 실행 프로젝트" } })).json()).data.project;
  const root = `${endpoint}/projects/${project.id}`;
  const bytes = wav(3000, 7);
  const upload = (await (await request.post(`${root}/uploads`, { headers: owner.headers, data: { requestKey: randomUUID(), name: "인터뷰.wav", kind: "original", size: bytes.length, sha256: sha(bytes), scope: "uploader_and_steward" } })).json()).data.upload;
  const part = (await (await request.post(`${root}/uploads/${upload.id}/parts`, { headers: owner.headers, data: { number: 1, checksum: createHash("sha256").update(bytes).digest("base64") } })).json()).data;
  expect((await fetch(part.url, { method: "PUT", headers: part.headers, body: new Uint8Array(bytes) })).status).toBe(200);
  expect((await request.post(`${root}/uploads/${upload.id}/complete`, { headers: owner.headers, data: {} })).status()).toBe(201);
  await expect
    .poll(async () => (await (await request.get(`${root}/uploads/${upload.id}`, { headers: owner.headers })).json()).data.upload.state, { timeout: 30000 })
    .toBe("ready");

  const target = `/dashboard/workspaces/${team.id}/projects/${project.id}`;
  await login(page, owner.email, target);
  await page.getByRole("link", { name: "AI 작업", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${target}/ai`));
  await expect(page.getByRole("heading", { name: "AI 작업", exact: true })).toBeVisible();
  await expect(page.getByText("에이전트 작업")).toBeVisible();
  await expect(page.getByRole("radio", { name: /에이전트 작업/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: /인터뷰\.wav/ }).check();
  await page.getByLabel("작업 지시").fill("인터뷰를 그대로 받아 적어 주세요.");

  // Lost quote response: the server created it; the page recovers the same key.
  let quoteKey = "";
  await page.route("**/ai/quotes", async (route) => {
    quoteKey = JSON.parse(route.request().postData() ?? "{}").requestKey;
    await route.fetch();
    await route.abort("connectionreset");
  }, { times: 1 });
  await page.getByRole("button", { name: "견적 받기" }).click();
  await expect(page.getByText("견적 요청 결과를 확인하지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "같은 요청 확인" }).click();
  await expect(page.getByRole("heading", { name: "견적", exact: true })).toBeVisible();
  const recovered = (await (await request.get(`${root}/ai/quote-requests/${quoteKey}`, { headers: owner.headers })).json()).data.quote;
  expect(recovered.maximumUnits).toBe(3);
  await expect(page.getByText("팀 공동 사용 가능량")).toBeVisible();
  await expect(page.getByText("팀 잔액을 쓸 수 있는 내 상한이며 별도로 지급된 양이 아닙니다.")).toBeVisible();
  await expect(page.getByText("9000", { exact: true })).toBeVisible();
  await expect(page.getByText("50", { exact: true })).toBeVisible();
  await page.screenshot({ path: "/Users/spagettimaker/My/Lasker/prepix-parallel/ai/scratch-d1/s30-quote-desktop.png", fullPage: true });
  await expect(page.getByRole("button", { name: "실행", exact: true })).toBeDisabled();
  await page.getByRole("checkbox", { name: /최대 3 .* 예약에 동의합니다/ }).check();

  // Hold the provider so the run is visibly in progress across a refresh.
  await mode(request, { completeLimit: 0 });
  let submitKey = "";
  await page.route("**/ai/jobs", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    submitKey = JSON.parse(route.request().postData() ?? "{}").requestKey;
    await route.fetch();
    await route.abort("connectionreset");
  }, { times: 1 });
  await page.getByRole("button", { name: "실행", exact: true }).click();
  await expect(page.getByRole("heading", { name: "작업 진행" })).toBeVisible({ timeout: 20000 });
  const jobs = (await (await request.get(`${endpoint}/ai/jobs`, { headers: owner.headers })).json()).data.jobs;
  expect(jobs).toHaveLength(1);
  expect((await (await request.get(`${root}/ai/submissions/${submitKey}`, { headers: owner.headers })).json()).data.job.id).toBe(jobs[0].id);
  await expect(page.getByText(/처리 중|접수됨/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "작업 진행" })).toBeVisible();
  await expect(page.getByText(/처리 중|접수됨/)).toBeVisible();

  // A failed status check is shown as such, never as finished or empty.
  await page.route("**/execution", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.getByRole("button", { name: "최신 상태 확인" }).click();
  await expect(page.getByText("아래는 마지막으로 확인한 상태입니다.")).toBeVisible();
  await expect(page.getByText("결과 받기")).toHaveCount(0);
  await page.unroute("**/execution");

  await mode(request, { completeLimit: null });
  await expect(page.getByText("결과가 준비되었습니다.")).toBeVisible({ timeout: 30000 });
  const view = (await (await request.get(`${root}/ai/jobs/${jobs[0].id}/execution`, { headers: owner.headers })).json()).data;
  expect(view.job.confirmedUnits).toBe(3);

  // Tampered bytes are refused; the real bytes verify against the server hash.
  await page.route("**/content?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const raw = Buffer.from(body.data.contentBase64, "base64");
    raw[raw.length - 3] ^= 1;
    body.data.contentBase64 = raw.toString("base64");
    await route.fulfill({ response, json: body });
  }, { times: 1 });
  await page.getByRole("button", { name: "결과 받기" }).click();
  await expect(page.getByText("받은 결과의 해시가 서버 기록과 달라 표시하지 않았습니다.")).toBeVisible();
  await page.getByRole("button", { name: "결과 받기" }).click();
  await expect(page.getByText(`받은 바이트의 SHA-256 확인됨: ${view.result.sha256}`)).toBeVisible();
  await expect(page.getByText("첫 문장.")).toBeVisible();
  await page.screenshot({ path: "/Users/spagettimaker/My/Lasker/prepix-parallel/ai/scratch-d1/s30-result-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "/Users/spagettimaker/My/Lasker/prepix-parallel/ai/scratch-d1/s30-result-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1360, height: 1100 });

  // Another account in this browser sees neither the run nor the project.
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("prepix-b2b-ai-run:")));
  expect(stored).toHaveLength(1);
  await page.context().clearCookies();
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (!k.startsWith("prepix-b2b-ai-run:")) localStorage.removeItem(k);
    sessionStorage.clear();
  });
  await login(page, other.email, `${target}/ai`);
  await expect(page.getByText("결과가 준비되었습니다.")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "작업 진행" })).toHaveCount(0);
  // The original account's record is kept under its own scope.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("prepix-b2b-ai-run:")))).toEqual(stored);
});
