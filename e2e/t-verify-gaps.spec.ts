import { test, expect, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { account, fixture, open, upload, videoReady, json, password, type Account } from "./b2b-review-helpers";

/**
 * Lane T verification gaps, against a LOCAL stack (API + DB + web).
 *   F02  switching space writes no rows
 *   F09  the trash screen shows the exact KST restore deadline (trashedAt + 30 days)
 *   FL12 a web review never asks for the original, only the review copy
 *   FL01 a reload in the middle of login keeps the original destination
 *
 * Every endpoint comes from env and the file refuses to load without them, so it can
 * never hit a stack it was not pointed at (no port defaults):
 *   B2B_E2E_WEB_URL, B2B_E2E_API_URL, WORKSPACES_TEST_DATABASE_URL, B2B_E2E_MEDIA_DIR
 *   (a directory holding cut-v1.mp4, a short clip), B2B_E2E_FIXTURE_DIR (backend scripts/).
 */
function need(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required (see the header of e2e/t-verify-gaps.spec.ts)`);
  return v;
}
const web = need("B2B_E2E_WEB_URL").replace(/\/+$/, "");
const api = need("B2B_E2E_API_URL").replace(/\/+$/, "");
const dbUrl = need("WORKSPACES_TEST_DATABASE_URL");
need("B2B_E2E_MEDIA_DIR");
need("B2B_E2E_FIXTURE_DIR");
for (const u of [web, api, dbUrl]) if (!/(127\.0\.0\.1|localhost)/.test(u)) throw new Error("local stack only");

async function team(request: Parameters<typeof account>[0], owner: Account, name: string, paid = false) {
  const id = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name, requestKey: randomUUID() } }))).workspace.id as string;
  if (paid) fixture("b2b-paid-test-fixture.cjs", { workspaceId: id, action: "purchase", target: "initial" });
  return id;
}

test("F02: switching personal <-> team and team A <-> team B writes no rows", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const owner = await account(request, "switch");
  const a = await team(request, owner, `Switch A ${randomUUID().slice(0, 6)}`);
  const b = await team(request, owner, `Switch B ${randomUUID().slice(0, 6)}`);
  const names = await json(request.get(`${api}/v2/workspaces`, { headers: owner.headers }));
  const nameOf = (id: string) => (names.workspaces as { id: string; name: string }[]).find((w) => w.id === id)!.name;
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const counts = async () => {
    const tables = (await pool.query("select table_schema s, table_name t from information_schema.tables where table_schema not in ('pg_catalog','information_schema','drizzle') and table_type='BASE TABLE' order by 1,2")).rows as { s: string; t: string }[];
    const out: Record<string, number> = {};
    for (const { s, t } of tables) out[`${s}.${t}`] = Number((await pool.query(`select count(*)::int n from "${s}"."${t}"`)).rows[0].n);
    return out;
  };
  try {
    const S = await open(browser, owner, "/dashboard/workspaces");
    await expect(S.page.getByRole("heading", { name: "워크스페이스", level: 1 })).toBeVisible();
    await S.page.waitForLoadState("networkidle");
    const switcher = () => S.page.locator('aside button[aria-haspopup="menu"]:visible').first();
    const pick = async (label: string) => {
      await switcher().click();
      await S.page.locator('[role="menu"]:visible').getByText(label, { exact: false }).first().click();
      await S.page.waitForLoadState("networkidle");
    };
    // One warm-up lap first: opening a space for the first time may legitimately lazy-create its own rows.
    // The assertion is about switching, so measure the laps after that.
    for (const label of [nameOf(a), "개인 공간", nameOf(b), nameOf(a)]) await pick(label);
    const before = await counts();
    const path: string[] = [];
    for (const label of [nameOf(b), "개인 공간", nameOf(a), nameOf(b), nameOf(a), "개인 공간"]) {
      await pick(label);
      path.push(new URL(S.page.url()).pathname);
    }
    const after = await counts();
    expect(path.some((p) => p.includes(a)) && path.some((p) => p.includes(b)), "the laps really moved between spaces").toBeTruthy();
    expect(Object.entries(after).filter(([t, n]) => before[t] !== n).map(([t, n]) => `${t}: ${before[t]} -> ${n}`)).toEqual([]);
    await S.close();
  } finally {
    await pool.end();
  }
});

async function lead(request: Parameters<typeof account>[0], label: string) {
  const owner = await account(request, `${label}-owner`);
  const leader = await account(request, `${label}-lead`);
  const teamId = await team(request, owner, `${label} ${randomUUID().slice(0, 6)}`, true);
  fixture("b2b-test-fixture.cjs", { workspaceId: teamId, action: "join", userId: leader.id });
  const project = (await json(request.post(`${api}/v2/workspaces/${teamId}/b2b/projects`, { headers: leader.headers, data: { requestKey: randomUUID(), name: "T 프로젝트" } }))).project.id as string;
  return { owner, leader, teamId, project };
}

test("FL12: opening a web review fetches the review copy only, never the original", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const { leader, teamId, project } = await lead(request, "fl12");
  const base = `/dashboard/workspaces/${teamId}/projects/${project}`;
  const root = `${api}/v2/workspaces/${teamId}/b2b/projects/${project}`;
  const L = await open(browser, leader, `${base}/files`);
  await upload(L.page, "cut-v1.mp4");
  await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: leader.headers }))).versions[0]?.previewState, { timeout: 120_000 }).toBe("ready");
  const version = (await json(request.get(`${root}/files`, { headers: leader.headers }))).versions[0] as { id: string };
  const created = await json(request.post(`${root}/reviews`, { headers: leader.headers, data: { requestKey: randomUUID(), title: "FL12 검토", versionId: version.id, audienceUserIds: [leader.id], approverUserId: leader.id } }));
  const reviewId = created.review.id as string;

  // Fresh page: record every request from the first byte of the review page.
  const R = await open(browser, leader, `${base}/reviews/${reviewId}`);
  const seen: string[] = [];
  R.page.on("request", (r) => seen.push(`${r.method()} ${r.url()}`));
  await R.page.goto(`${base}/reviews/${reviewId}`);
  await videoReady(R.page);
  await R.page.locator("video").evaluate((v: HTMLVideoElement) => v.play().catch(() => {}));
  await R.page.waitForTimeout(1500);
  await R.page.waitForLoadState("networkidle");
  const copy = seen.filter((u) => u.includes("b2b-previews"));
  expect(copy.length, "the review copy is streamed").toBeGreaterThan(0);
  const originals = seen.filter((u) => /\/b2b\/[0-9a-f-]{36}\/original|\/download\b|\/original\b|\/originals\b/.test(u) && !u.includes("b2b-previews"));
  expect(originals).toEqual([]);
  expect(seen.filter((u) => u.startsWith("POST") && /download/.test(u))).toEqual([]);
  await R.close();
  await L.close();
});

/** What the trash screen prints for an ISO instant, worked out here by hand (UTC+9), not by the app. */
function kst(iso: string) {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

function wav(size: number) {
  const value = Buffer.alloc(size, 17);
  value.write("RIFF", 0);
  value.writeUInt32LE(size - 8, 4);
  value.write("WAVEfmt ", 8);
  value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20);
  value.writeUInt16LE(1, 22);
  value.writeUInt32LE(8000, 24);
  value.writeUInt32LE(16000, 28);
  value.writeUInt16LE(2, 32);
  value.writeUInt16LE(16, 34);
  value.write("data", 36);
  value.writeUInt32LE(size - 44, 40);
  return value;
}

/** A library-only original owned by `user` (the steward), uploaded through the real transfer flow. */
async function libraryOriginal(request: Parameters<typeof account>[0], user: Account, libraryRoot: string, name: string) {
  const content = wav(32044);
  const begin = await request.post(`${libraryRoot}/uploads`, { headers: user.headers, data: { requestKey: randomUUID(), name, kind: "original", size: content.length, sha256: createHash("sha256").update(content).digest("hex"), scope: "uploader_and_steward" } });
  expect(begin.status(), await begin.text()).toBe(201);
  const upload = (await begin.json()).data.upload as { id: string; partSize: number; versionId: string };
  for (let offset = 0, number = 1; offset < content.length; offset += upload.partSize, number++) {
    const part = content.subarray(offset, offset + upload.partSize);
    const signed = await request.post(`${libraryRoot}/uploads/${upload.id}/parts`, { headers: user.headers, data: { number, checksum: createHash("sha256").update(part).digest("base64") } });
    expect(signed.status(), await signed.text()).toBe(201);
    const target = (await signed.json()).data;
    expect((await request.put(target.url, { headers: target.headers, data: part })).status()).toBe(200);
  }
  expect((await request.post(`${libraryRoot}/uploads/${upload.id}/complete`, { headers: user.headers, data: {} })).status()).toBe(201);
  await expect.poll(async () => (await json(request.get(`${libraryRoot}/uploads/${upload.id}`, { headers: user.headers }))).upload.state, { timeout: 30_000 }).toBe("ready");
  return upload.versionId;
}

test("F09: the trash screen shows the exact KST restore deadline (trashedAt + 30 days)", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const { leader, teamId } = await lead(request, "f09");
  const lib = `${api}/v2/workspaces/${teamId}/b2b`;
  const versionId = await libraryOriginal(request, leader, `${lib}/library`, "restore-deadline.wav");
  const got = await request.get(`${lib}/library/files/${versionId}`, { headers: leader.headers });
  expect(got.status(), await got.text()).toBe(200);
  const revision = (await got.json()).data.version.assetRevision as number;
  const trashed = await request.post(`${lib}/file-trash`, { headers: leader.headers, data: { requestKey: randomUUID(), versionId, revision, reason: "삭제 시험", fromLibrary: true } });
  expect(trashed.status(), await trashed.text()).toBe(201);
  const listed = (await json(request.get(`${lib}/file-trash`, { headers: leader.headers }))).entries as { restoreUntil: string; trashedAt: string; version: { id: string } }[];
  const row = listed.find((e) => e.version.id === versionId)!;
  expect(Date.parse(row.restoreUntil) - Date.parse(row.trashedAt)).toBe(30 * 86_400_000);
  const want = kst(row.restoreUntil);
  const L = await open(browser, leader, `/dashboard/workspaces/${teamId}/library`);
  const shown = L.page.getByTestId(`trash-file-${versionId}`);
  await expect(shown).toBeVisible();
  const text = (await shown.innerText()).replace(/\s+/g, " ");
  // ko-KR: "2026. 11. 6. 오후 2:05:33" in Asia/Seoul.
  const m = text.match(/(\d{4})\. (\d{1,2})\. (\d{1,2})\. (오전|오후) (\d{1,2}):(\d{2}):\d{2}/);
  expect(m, text).toBeTruthy();
  const hour24 = (Number(m![5]) % 12) + (m![4] === "오후" ? 12 : 0);
  expect([Number(m![1]), Number(m![2]), Number(m![3]), hour24, Number(m![6])]).toEqual([want.y, want.m, want.d, want.h, want.min]);
  await L.close();
});

test("FL01: a deep link opened logged out, reloaded in the middle of login, still lands on the destination", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { leader, teamId } = await lead(request, "fl01");
  const destination = `/dashboard/workspaces/${teamId}/library`;
  const context = await browser.newContext({ locale: "ko-KR" });
  const page: Page = await context.newPage();
  await page.goto(`${web}${destination}`);
  await expect(page).toHaveURL(/\/login/);
  const returnTo = () => new URL(page.url()).searchParams.get("returnTo");
  expect(returnTo()).toBe(destination);
  await page.getByLabel("이메일", { exact: true }).fill(leader.email);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  expect(returnTo(), "the destination survives a reload mid-login").toBe(destination);
  // A wrong password, then another reload, then the right one.
  await page.getByLabel("이메일", { exact: true }).fill(leader.email);
  await page.getByLabel("비밀번호", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.reload();
  expect(returnTo()).toBe(destination);
  await page.getByLabel("이메일", { exact: true }).fill(leader.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(destination.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await context.close();
});
