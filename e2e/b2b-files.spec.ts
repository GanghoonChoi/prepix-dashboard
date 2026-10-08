import {
  test,
  expect,
  type APIRequestContext,
} from "@playwright/test";
import { harnessEnv } from "./harness-env";
// The backend fixtures this spec runs fall back to a shared PG (55438) when unset.
harnessEnv("WORKSPACES_TEST_DATABASE_URL");
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
const api = process.env.B2B_E2E_API_URL ?? "http://127.0.0.1:3312",
  password = "LocalPreview123";
async function account(request: APIRequestContext) {
  const email = `files-${randomUUID()}@example.test`;
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: "File producer" },
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
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/request`, { headers })
    ).status(),
  ).toBe(200);
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
  return {
    email,
    headers,
    accessToken: session.accessToken as string,
    refreshToken: session.refreshToken as string,
    id: session.user.id as string,
  };
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

test("real private upload resumes after reload, verifies immutable content and survives cancellation response loss", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const user = await account(request);
  const teamResponse = await request.post(`${api}/v2/workspaces`, {
    headers: user.headers,
    data: { name: "파일 전송 인수", requestKey: randomUUID() },
  });
  expect(teamResponse.status()).toBe(201);
  const team = (await teamResponse.json()).data.workspace;
  execFileSync(
    process.execPath,
    [
      process.env.B2B_E2E_FIXTURE_PATH ??
        resolve("../prepix-backend/backend/scripts/b2b-paid-test-fixture.cjs"),
      JSON.stringify({
        workspaceId: team.id,
        action: "purchase",
        target: "initial",
      }),
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  const projectResponse = await request.post(
    `${api}/v2/workspaces/${team.id}/b2b/projects`,
    {
      headers: user.headers,
      data: { requestKey: randomUUID(), name: "이어 보내는 프로젝트", visibility: "private" },
    },
  );
  expect(projectResponse.status()).toBe(201);
  const project = (await projectResponse.json()).data.project;
  const root = `${api}/v2/workspaces/${team.id}/b2b/projects/${project.id}`;
  const caps = (
    await (
      await request.get(`${root}/files/capabilities`, { headers: user.headers })
    ).json()
  ).data;
  expect(
    caps.uploadsEnabled,
    "Start the explicit B2B_TEST_FILES local harness",
  ).toBe(true);
  const target = `/dashboard/workspaces/${team.id}/projects/${project.id}/files`;
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "프로젝트 자료", exact: true }),
  ).toBeVisible();
  const content = wav(16 * 1024 * 1024 + 16044);
  let held = false,
    partTwoSeen!: () => void,
    releasePartTwo!: () => void;
  const secondPart = new Promise<void>((resolve) => {
      partTwoSeen = resolve;
    }),
    release = new Promise<void>((resolve) => {
      releasePartTwo = resolve;
    });
  const signedParts: number[] = [];
  await page.route("**/uploads/*/parts", async (route) => {
    const number = route.request().postDataJSON().number;
    signedParts.push(number);
    if (number === 2 && !held) {
      held = true;
      partTwoSeen();
      await release;
    }
    try {
      await route.continue();
    } catch {
      /* aborted transport after pause */
    }
  });
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name: "original.wav",
    mimeType: "audio/wav",
    buffer: content,
  });
  await page
    .getByRole("button", { name: "팀에 보관 시작", exact: true })
    .click();
  await secondPart;
  await page.getByRole("button", { name: "일시 중단", exact: true }).click();
  releasePartTwo();
  await expect(
    page.getByRole("button", { name: "일시 중단", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByLabel("original.wav 원본 선택 후 재개", { exact: true }),
  ).toBeVisible();
  const before = signedParts.length;
  const source = page.getByLabel("original.wav 원본 선택 후 재개", {
    exact: true,
  });
  await source.focus();
  await expect
    .poll(() =>
      source.evaluate((el) => getComputedStyle(el.parentElement!).outlineStyle),
    )
    .toBe("solid");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "등록 결과 확인", exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("original.wav 원본 선택 후 재개", { exact: true })
    .setInputFiles({
      name: "original.wav",
      mimeType: "audio/wav",
      buffer: Buffer.alloc(content.length, 19),
    });
  await expect(
    page.getByText("처음 등록한 파일과 내용이 다릅니다.", { exact: false }),
  ).toBeVisible();
  expect(signedParts).toHaveLength(before);
  await page
    .getByLabel("original.wav 원본 선택 후 재개", { exact: true })
    .setInputFiles({
      name: "renamed.wav",
      mimeType: "audio/wav",
      buffer: content,
    });
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${root}/files`, { headers: user.headers })
          ).json()
        ).data.versions.length,
      { timeout: 45000 },
    )
    .toBe(1);
  expect(signedParts.slice(before)).toEqual([2]);
  await page.reload();
  await expect(
    page.getByText("보관됨 · 미리보기 미생성", { exact: false }),
  ).toBeVisible();
  const catalogue = (
    await (await request.get(`${root}/files`, { headers: user.headers })).json()
  ).data.versions;
  expect(catalogue[0].sha256).toBe(
    createHash("sha256").update(content).digest("hex"),
  );
  expect(catalogue[0].ordinal).toBe(1);
  expect(
    (
      await (
        await request.get(`${root}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.reservedBytes,
  ).toBe("0");
  // Stage real ranged bytes, pause before the second block and reload. The
  // browser filesystem survives; the first block must not be fetched again.
  const receivedRanges: string[] = [];
  let secondRangeSeen!: () => void,
    releaseRange!: () => void,
    rangeHeld = false;
  const waitingRange = new Promise<void>((resolve) => {
      secondRangeSeen = resolve;
    }),
    continueRange = new Promise<void>((resolve) => {
      releaseRange = resolve;
    });
  await page.context().route("http://127.0.0.1:3900/**", async (route) => {
    const range = route.request().headers().range;
    if (route.request().method() === "GET" && range) {
      receivedRanges.push(range);
      if (range.startsWith("bytes=8388608-") && !rangeHeld) {
        rangeHeld = true;
        secondRangeSeen();
        await continueRange;
      }
    }
    try {
      await route.continue();
    } catch {
      /* paused worker transport */
    }
  });
  await page
    .getByRole("button", { name: "원본 다운로드", exact: true })
    .click();
  await waitingRange;
  const competing = await page.context().newPage();
  await competing.goto(target);
  await competing
    .getByRole("button", { name: "원본 수령 재개", exact: true })
    .click();
  await expect(
    competing.getByText("다른 탭에서 같은 원본을 수령하거나 정리 중입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await competing.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/prepix-verified-download-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "수령 중단", exact: true }).click();
  releaseRange();
  await expect(
    page.getByRole("button", { name: "수령 중단", exact: true }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 1360, height: 1100 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "원본 수령 재개", exact: true }),
  ).toBeVisible();
  const rangesBefore = receivedRanges.length;
  let grants = 0,
    exported = 0;
  page.on("download", () => {
    exported++;
  });
  // Revoke the steward's separate download grant after all bytes are received,
  // immediately before the final real authorization. Cached bytes cannot export.
  await page.route(`**/files/${catalogue[0].id}/download`, async (route) => {
    grants++;
    if (grants === 3)
      expect(
        (
          await request.post(
            `${root}/assets/${catalogue[0].assetId}/permissions`,
            {
              headers: user.headers,
              data: {
                requestKey: randomUUID(),
                revision: 0,
                userId: user.id,
                canDownload: false,
                canUseForAi: false,
                reason: "Revoke before local export",
              },
            },
          )
        ).status(),
      ).toBe(201);
    await route.continue();
  });
  await page
    .getByRole("button", { name: "원본 수령 재개", exact: true })
    .click();
  await expect(
    page.getByText("현재 접근할 수 없는 수령 기록", { exact: true }),
  ).toBeVisible();
  expect(exported).toBe(0);
  expect(receivedRanges.slice(rangesBefore)).toEqual([
    `bytes=8388608-16777215`,
    `bytes=16777216-${content.length - 1}`,
  ]);
  await page.unroute(`**/files/${catalogue[0].id}/download`);
  expect(
    (
      await request.post(`${root}/assets/${catalogue[0].assetId}/permissions`, {
        headers: user.headers,
        data: {
          requestKey: randomUUID(),
          revision: 1,
          userId: user.id,
          canDownload: true,
          canUseForAi: true,
          reason: "Restore original receipt access",
        },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  const downloading = page.waitForEvent("download"),
    beforeCached = receivedRanges.length;
  await page
    .getByRole("button", { name: "원본 수령 재개", exact: true })
    .click();
  const received = await downloading;
  expect(receivedRanges).toHaveLength(beforeCached);
  await received.saveAs("/tmp/prepix-b2b-file-downloaded.wav");
  expect(
    createHash("sha256")
      .update(await readFile("/tmp/prepix-b2b-file-downloaded.wav"))
      .digest("hex"),
  ).toBe(catalogue[0].sha256);
  await expect(
    page.getByText("검증 완료 · 파일 저장 시작됨", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "임시 수령 삭제", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "원본 수령", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "전송 기록 닫기", exact: true })
    .click();
  // Existing series and a same-name new asset are explicit, distinct choices.
  const small = wav(16044);
  await page
    .getByRole("combobox", { name: "등록 방식", exact: true })
    .selectOption(catalogue[0].assetId);
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name: "revision.wav",
    mimeType: "audio/wav",
    buffer: small,
  });
  await page
    .getByRole("button", { name: "팀에 보관 시작", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${root}/files`, { headers: user.headers })
          ).json()
        ).data.versions.length,
    )
    .toBe(2);
  await page.reload();
  const second = (
    await (await request.get(`${root}/files`, { headers: user.headers })).json()
  ).data.versions;
  expect(second.find((v: { ordinal: number }) => v.ordinal === 2).assetId).toBe(
    catalogue[0].assetId,
  );
  expect(
    second.find((v: { id: string }) => v.id === catalogue[0].id).sha256,
  ).toBe(catalogue[0].sha256);
  await page
    .getByRole("button", { name: "전송 기록 닫기", exact: true })
    .click();
  const usedBefore = (
    await (
      await request.get(`${root}/files/capabilities`, { headers: user.headers })
    ).json()
  ).data.storage.usedBytes;
  await page
    .getByRole("combobox", { name: "등록 방식", exact: true })
    .selectOption("");
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name: "original.wav",
    mimeType: "audio/wav",
    buffer: small,
  });
  await page
    .getByRole("button", { name: "팀에 보관 시작", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${root}/files`, { headers: user.headers })
          ).json()
        ).data.versions.length,
    )
    .toBe(3);
  await page.reload();
  const third = (
    await (await request.get(`${root}/files`, { headers: user.headers })).json()
  ).data.versions;
  expect(new Set(third.map((v: { assetId: string }) => v.assetId)).size).toBe(
    2,
  );
  expect(
    (
      await (
        await request.get(`${root}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(usedBefore);
  await page
    .getByRole("button", { name: "전송 기록 닫기", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/prepix-b2b-files-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // Lose a genuine begin reply after its server reservation. The durable key
  // still resolves the same upload after reload; cancel uses that original key.
  let loseBegin = true;
  await page.route(`**/projects/${project.id}/uploads`, async (route) => {
    if (route.request().method() === "POST" && loseBegin) {
      loseBegin = false;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByLabel("보관할 파일", { exact: true }).setInputFiles({
    name: "uncertain.wav",
    mimeType: "audio/wav",
    buffer: wav(16044),
  });
  await page
    .getByRole("button", { name: "팀에 보관 시작", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "전송 취소", exact: true }),
  ).toBeVisible();
  await page.reload();
  const cancelKeys: string[] = [];
  await page.route("**/uploads/requests/*/cancel", async (route) => {
    cancelKeys.push(route.request().url());
    if (cancelKeys.length === 1) {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "전송 취소", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "취소 결과 재확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "취소 결과 재확인", exact: true })
    .click();
  await expect(
    page.getByText("취소 확인됨 · 임시 자료 정리는 별도 진행", {
      exact: false,
    }),
  ).toBeVisible();
  expect(cancelKeys[0]).toBe(cancelKeys[1]);
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${root}/files/capabilities`, {
              headers: user.headers,
            })
          ).json()
        ).data.storage.reservedBytes,
      { timeout: 20000 },
    )
    .toBe("0");
  expect(
    (
      await (
        await request.get(`${root}/files`, { headers: user.headers })
      ).json()
    ).data.versions,
  ).toHaveLength(3);
  // Delete moves a file to the trash; 최근 삭제한 파일 brings it back (2026-10-08).
  const versionCount = async () =>
    (
      await (await request.get(`${root}/files`, { headers: user.headers })).json()
    ).data.versions.length;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  const deletable = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: /작업$/ }) })
    .first();
  const deletedName = await deletable.getByRole("heading").first().innerText();
  await deletable.getByRole("button", { name: /작업$/ }).click();
  await page.getByRole("menuitem", { name: "삭제", exact: true }).click();
  const confirmDelete = page.getByRole("alertdialog", { name: "파일 삭제" });
  await expect(confirmDelete).toContainText("30일");
  await confirmDelete.getByRole("button", { name: "삭제", exact: true }).click();
  await expect.poll(versionCount).toBe(2);
  const recent = page.getByText(/^최근 삭제한 파일 1$/);
  await expect(recent).toBeVisible();
  await recent.click();
  const trashed = page.getByRole("list", { name: "최근 삭제한 파일" }).getByRole("listitem");
  await expect(trashed).toHaveCount(1);
  await expect(trashed).toContainText(deletedName);
  await trashed.getByRole("button", { name: "복원", exact: true }).click();
  await expect.poll(versionCount).toBe(3);
  await expect(page.getByText(/^최근 삭제한 파일/)).toHaveCount(0);
  // Account assertion is enforced even if a different valid JWT can read this
  // team. A forged expectation cannot reserve or retrieve any file metadata.
  expect(
    (
      await request.get(`${root}/files`, {
        headers: { ...user.headers, "X-Prepix-Account-ID": randomUUID() },
      })
    ).status(),
  ).toBe(403);
  for (const endpoint of [
    `${root}/people`,
    `${api}/v2/workspaces/${team.id}/b2b/projects`,
  ]) {
    expect(
      (
        await request.get(endpoint, {
          headers: { ...user.headers, "X-Prepix-Account-ID": randomUUID() },
        })
      ).status(),
    ).toBe(403);
  }
  const other = await account(request);
  await page.evaluate(
    (session) => {
      localStorage.setItem("accessToken", session.accessToken);
      localStorage.setItem("refreshToken", session.refreshToken);
      window.dispatchEvent(new Event("focus"));
    },
    { accessToken: other.accessToken, refreshToken: other.refreshToken },
  );
  await expect(
    page.getByRole("heading", { name: "original.wav", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("uncertain.wav", { exact: true })).toHaveCount(0);
  await expect(page.getByText(project.name, { exact: true })).toHaveCount(0);
});
