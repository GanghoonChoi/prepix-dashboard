import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { harnessEnv } from "./harness-env";
// The backend fixtures this spec runs fall back to a shared PG (55438) when unset.
harnessEnv("WORKSPACES_TEST_DATABASE_URL");
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  TeamFileUpload,
  TeamFileUploadStatus,
} from "../lib/api/generated/b2b";
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
async function registerStewardFixture(
  request: APIRequestContext,
  user: Awaited<ReturnType<typeof account>>,
  root: string,
  name: string,
  size: number,
  existingAssetId?: string,
) {
  const content = wav(size);
  const begin = await request.post(`${root}/uploads`, {
    headers: user.headers,
    data: {
      requestKey: randomUUID(),
      name,
      kind: "original",
      size,
      sha256: createHash("sha256").update(content).digest("hex"),
      scope: "uploader_and_steward",
      ...(existingAssetId ? { existingAssetId } : {}),
    },
  });
  expect(begin.status(), await begin.text()).toBe(201);
  const status = (await begin.json()).data as TeamFileUploadStatus;
  const upload = status.upload;
  for (
    let offset = 0, number = 1;
    offset < content.length;
    offset += upload.partSize, number++
  ) {
    const part = content.subarray(offset, offset + upload.partSize);
    const signed = await request.post(`${root}/uploads/${upload.id}/parts`, {
      headers: user.headers,
      data: {
        number,
        checksum: createHash("sha256").update(part).digest("base64"),
      },
    });
    expect(signed.status(), await signed.text()).toBe(201);
    const target = (await signed.json()).data;
    const sent = await request.put(target.url, {
      headers: target.headers,
      data: part,
    });
    expect(sent.status(), await sent.text()).toBe(200);
  }
  const complete = await request.post(`${root}/uploads/${upload.id}/complete`, {
    headers: user.headers,
    data: {},
  });
  expect(complete.status(), await complete.text()).toBe(201);
  await expect
    .poll(
      async () => {
        const current = await request.get(`${root}/uploads/${upload.id}`, {
          headers: user.headers,
        });
        expect(current.status()).toBe(200);
        return ((await current.json()).data.upload as TeamFileUpload).state;
      },
      { timeout: 30000 },
    )
    .toBe("ready");
  return upload;
}
async function loginSteward(
  page: Page,
  user: Awaited<ReturnType<typeof account>>,
  target: string,
) {
  if (
    page
      .url()
      .startsWith(process.env.B2B_E2E_WEB_URL ?? "http://localhost:3001")
  )
    await page.evaluate(() => localStorage.clear());
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
}
async function invite(
  request: APIRequestContext,
  owner: Awaited<ReturnType<typeof account>>,
  teamId: string,
  projectId: string,
  user: Awaited<ReturnType<typeof account>>,
  role: "producer" | "reviewer",
) {
  const existing = new Set<string>(
    (await (await request.get(`${api}/__test/mail`)).json())
      .filter((m: { to: string }) => m.to === user.email)
      .map((m: { inviteUrl?: string }) => m.inviteUrl),
  );
  expect(
    (
      await request.post(`${api}/v2/workspaces/${teamId}/b2b/invitations`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          email: user.email,
          kind: "internal",
          teamRole: "editor",
          projectId,
          projectRole: role,
          canDownload: false,
        },
      })
    ).status(),
  ).toBe(201);
  let inviteUrl = "";
  await expect
    .poll(async () => {
      const mail = await (await request.get(`${api}/__test/mail`)).json();
      inviteUrl =
        mail.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === user.email &&
            m.inviteUrl?.includes("/b2b-invitations/") &&
            !existing.has(m.inviteUrl),
        )?.inviteUrl ?? "";
      return inviteUrl;
    })
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
  // The management UI works against current project participants, with read,
  // original-download and AI-use grants remaining separate.
  const producer = await account(request),
    reviewer = await account(request);
  await invite(request, user, team.id, project.id, producer, "producer");
  await invite(request, user, team.id, project.id, reviewer, "reviewer");
  const managed = third[0];
  const row = () =>
    page
      .getByRole("listitem")
      .filter({
        has: page.getByRole("heading", {
          name: managed.assetName,
          exact: true,
        }),
      })
      .first();
  await row()
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  let dialog = page.getByRole("alertdialog", {
    name: "자료 권한 관리",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "현재 참여자", exact: true })
    .selectOption(reviewer.id);
  await expect(
    dialog.getByLabel("AI 입력 사용 허용", { exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("변경 사유", { exact: true })
    .fill("검토를 위한 열람");
  await dialog
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const reviewFiles = (
    await (
      await request.get(`${root}/files`, { headers: reviewer.headers })
    ).json()
  ).data.versions;
  expect(reviewFiles).toHaveLength(1);
  expect(reviewFiles[0].allowedActions.download).toBe(false);
  expect(reviewFiles[0].allowedActions.ai).toBe(false);
  const permissionKeys: string[] = [];
  await page.route(
    `**/assets/${managed.assetId}/permissions`,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      permissionKeys.push(route.request().postDataJSON().requestKey);
      if (permissionKeys.length === 1) {
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await row()
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "자료 권한 관리",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "현재 참여자", exact: true })
    .selectOption(producer.id);
  await dialog
    .getByLabel("변경 사유", { exact: true })
    .fill("제작자 열람만 허용");
  await dialog
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 재시도", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("변경이 반영되었습니다.", { exact: false }),
  ).toBeVisible();
  expect(permissionKeys).toHaveLength(1);
  expect(
    (
      await (
        await request.get(`${root}/files`, { headers: producer.headers })
      ).json()
    ).data.versions[0].allowedActions,
  ).toMatchObject({ download: false, ai: false });
  await row()
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "자료 권한 관리",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "현재 참여자", exact: true })
    .selectOption(producer.id);
  await dialog.getByLabel("원본 다운로드 허용", { exact: true }).check();
  await dialog.getByLabel("AI 입력 사용 허용", { exact: true }).check();
  await dialog
    .getByLabel("변경 사유", { exact: true })
    .fill("제작에 필요한 자료 권한");
  await dialog
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    (
      await (
        await request.get(`${root}/files`, { headers: producer.headers })
      ).json()
    ).data.versions[0].allowedActions,
  ).toMatchObject({ download: false, ai: true });
  expect(
    (
      await request.post(`${root}/files/${managed.id}/download`, {
        headers: producer.headers,
        data: {},
      })
    ).status(),
  ).toBe(403);
  const targetReply = await request.post(
    `${api}/v2/workspaces/${team.id}/b2b/projects`,
    {
      headers: user.headers,
      data: { requestKey: randomUUID(), name: "정확한 버전 연결 대상", visibility: "private" },
    },
  );
  expect(targetReply.status()).toBe(201);
  const linkedProject = (await targetReply.json()).data.project;
  await invite(request, user, team.id, linkedProject.id, producer, "producer");
  const targetRoot = `${api}/v2/workspaces/${team.id}/b2b/projects/${linkedProject.id}`;
  await row()
    .getByRole("button", { name: "다른 프로젝트에 연결", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "다른 프로젝트에 연결",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "연결할 프로젝트", exact: true })
    .selectOption(linkedProject.id);
  await dialog
    .getByRole("button", { name: "다른 프로젝트에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(
    (
      await (
        await request.get(`${targetRoot}/files`, { headers: user.headers })
      ).json()
    ).data.versions.map((v: { id: string }) => v.id),
  ).toEqual([managed.id]);
  expect(
    (
      await (
        await request.get(`${targetRoot}/files`, { headers: producer.headers })
      ).json()
    ).data.versions,
  ).toHaveLength(0);
  expect(
    (
      await (
        await request.get(`${root}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(usedBefore);
  await page.goto(
    `/dashboard/workspaces/${team.id}/projects/${linkedProject.id}/files`,
  );
  const unlinkKeys: string[] = [];
  await page.route(`**/files/${managed.id}/unlink`, async (route) => {
    unlinkKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "프로젝트 연결 제외", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "프로젝트 연결 제외",
    exact: true,
  });
  await dialog
    .getByLabel("변경 사유", { exact: true })
    .fill("연결을 제외하고 보관 파일 유지");
  await dialog
    .getByRole("button", { name: "프로젝트 연결 제외", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 재시도", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("변경이 반영되었습니다.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "프로젝트 연결 제외", exact: true }),
  ).toHaveCount(0);
  expect(unlinkKeys).toHaveLength(1);
  expect(
    (
      await (
        await request.get(`${root}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(usedBefore);
  await page.goto(target);
  await expect(
    page.getByRole("heading", { name: "프로젝트 자료", exact: true }),
  ).toBeVisible();
  // Keyboard focus stays in the management dialog and returns to its opener.
  const opener = row().getByRole("button", {
    name: "자료 권한 관리",
    exact: true,
  });
  await opener.click();
  dialog = page.getByRole("alertdialog", {
    name: "자료 권한 관리",
    exact: true,
  });
  await expect(
    dialog.getByRole("combobox", { name: "현재 참여자", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("combobox", { name: "현재 참여자", exact: true })
    .selectOption(producer.id);
  await page.screenshot({
    path: "/tmp/prepix-b2b-file-management-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "닫기", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("combobox", { name: "현재 참여자", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
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
  // An exact version with no active project reference remains available only
  // to its currently authorized steward through the library.
  const libraryRoot = `${api}/v2/workspaces/${team.id}/b2b/library`,
    libraryPath = `/dashboard/workspaces/${team.id}/library`;
  expect(
    (
      await request.post(`${root}/files/${managed.id}/unlink`, {
        headers: user.headers,
        data: {
          requestKey: randomUUID(),
          revision: 0,
          reason: "Keep only in library",
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto(libraryPath);
  expect(
    (
      await request.get(`${libraryRoot}?kind=unsupported`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get(`${libraryRoot}/files/${managed.id}`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(libraryRoot, {
        headers: { ...user.headers, "X-Prepix-Account-ID": producer.id },
      })
    ).status(),
  ).toBe(403);
  await expect(
    page.getByRole("heading", { name: "보관함", exact: true }),
  ).toBeVisible();
  const libraryRow = () => page.getByTestId(`library-file-${managed.id}`);
  await expect(libraryRow()).toBeVisible();
  await libraryRow()
    .getByText("버전 상세와 사용 위치", { exact: true })
    .click();
  await expect(
    libraryRow().getByText("현재 표시할 수 있는 프로젝트 연결이 없습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(libraryRoot, { headers: reviewer.headers })
      ).json()
    ).data.entries,
  ).toHaveLength(0);
  const libraryDownload = page.waitForEvent("download");
  await libraryRow()
    .getByRole("button", { name: "원본 받기", exact: true })
    .click();
  const libraryExport = await libraryDownload;
  await libraryExport.saveAs("/tmp/prepix-library-original.wav");
  expect(
    createHash("sha256")
      .update(await readFile("/tmp/prepix-library-original.wav"))
      .digest("hex"),
  ).toBe(managed.sha256);
  // The orphan can be restored to its original project with an explicit
  // library intent, rather than being forced into a different project.
  await libraryRow()
    .getByRole("button", { name: "프로젝트에 연결", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "다른 프로젝트에 연결",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "연결할 프로젝트", exact: true })
    .selectOption(project.id);
  await dialog
    .getByRole("button", { name: "다른 프로젝트에 연결", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const libraryReference = (
    await (await request.get(`${root}/files`, { headers: user.headers })).json()
  ).data.versions.find((v: { id: string }) => v.id === managed.id);
  expect(libraryReference).toBeTruthy();
  expect(
    (
      await request.post(`${root}/files/${managed.id}/unlink`, {
        headers: user.headers,
        data: {
          requestKey: randomUUID(),
          revision: libraryReference.referenceRevision,
          reason: "Move the retained version",
        },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  const libraryKeys: string[] = [];
  await page.route(
    `**/projects/${linkedProject.id}/files/link`,
    async (route) => {
      libraryKeys.push(route.request().postDataJSON().requestKey);
      expect(route.request().postDataJSON().fromLibrary).toBe(true);
      await route.fetch();
      await route.abort("failed");
    },
  );
  await libraryRow()
    .getByRole("button", { name: "프로젝트에 연결", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "다른 프로젝트에 연결",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "연결할 프로젝트", exact: true })
    .selectOption(linkedProject.id);
  await dialog
    .getByRole("button", { name: "다른 프로젝트에 연결", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 재시도", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("변경이 반영되었습니다.", { exact: false }),
  ).toBeVisible();
  expect(libraryKeys).toHaveLength(1);
  await libraryRow()
    .getByText("버전 상세와 사용 위치", { exact: true })
    .click();
  await expect(
    libraryRow().getByRole("link", { name: linkedProject.name, exact: true }),
  ).toBeVisible();
  expect(
    (
      await (
        await request.get(`${targetRoot}/files`, { headers: producer.headers })
      ).json()
    ).data.versions,
  ).toHaveLength(0);
  expect(
    (
      await (
        await request.get(`${root}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(usedBefore);
  await page.screenshot({
    path: "/tmp/prepix-library-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  // Filtering must keep the original-scope receipt and its local cleanup.
  await page
    .getByRole("combobox", { name: "자료 종류", exact: true })
    .selectOption("output");
  await expect(libraryRow()).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "임시 수령 삭제", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "임시 수령 삭제", exact: true })
    .click();
  await page.goto(target);
  // Restore the source reference so the existing account-switch management
  // check below still exercises a live project permission dialog.
  expect(
    (
      await request.post(`${root}/files/link`, {
        headers: user.headers,
        data: {
          requestKey: randomUUID(),
          sourceProjectId: linkedProject.id,
          versionId: managed.id,
          fromLibrary: true,
        },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
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
  expect(
    (
      await request.get(
        `${root}/files/operations/permission/${permissionKeys[0]}?inputHash=bad`,
        { headers: user.headers },
      )
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.get(
        `${root}/files/operations/unknown/${permissionKeys[0]}?inputHash=${"0".repeat(64)}`,
        { headers: user.headers },
      )
    ).status(),
  ).toBe(422);
  const other = await account(request);
  await row()
    .getByRole("button", { name: "자료 권한 관리", exact: true })
    .click();
  await expect(
    page
      .getByRole("alertdialog", { name: "자료 권한 관리", exact: true })
      .getByRole("combobox", { name: "현재 참여자", exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("alertdialog", { name: "자료 권한 관리", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(producer.email, { exact: false })).toHaveCount(0);
});

test("direct library registration resumes its projectless transfer, verifies original bytes and recovers an exact relink", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const user = await account(request);
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: user.headers,
        data: { name: "보관함 직접 등록 인수", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace;
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
  const libraryRoot = `${api}/v2/workspaces/${team.id}/b2b/library`;
  expect(
    (
      await (
        await request.get(`${libraryRoot}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.uploadsEnabled,
  ).toBe(true);
  const target = `/dashboard/workspaces/${team.id}/library`;
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(user.email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "보관함", exact: true }),
  ).toBeVisible();
  const content = wav(16 * 1024 * 1024 + 16044),
    name = "library-original.wav";
  let held = false,
    seen!: () => void,
    release!: () => void;
  const second = new Promise<void>((r) => (seen = r)),
    gate = new Promise<void>((r) => (release = r));
  const parts: number[] = [];
  await page.route("**/b2b/library/uploads/*/parts", async (route) => {
    const number = route.request().postDataJSON().number;
    parts.push(number);
    if (number === 2 && !held) {
      held = true;
      seen();
      await gate;
    }
    try {
      await route.continue();
    } catch {
      /* paused transfer */
    }
  });
  await page
    .getByLabel("보관할 파일", { exact: true })
    .setInputFiles({ name, mimeType: "audio/wav", buffer: content });
  await page
    .getByRole("button", { name: "팀에 보관 시작", exact: true })
    .click();
  await second;
  await page.getByRole("button", { name: "일시 중단", exact: true }).click();
  release();
  await page.reload();
  const source = page.getByLabel(`${name} 원본 선택 후 재개`, { exact: true });
  await expect(source).toBeVisible();
  const before = parts.length;
  await source.setInputFiles({
    name,
    mimeType: "audio/wav",
    buffer: Buffer.alloc(content.length, 99),
  });
  await expect(
    page.getByText("처음 등록한 파일과 내용이 다릅니다.", { exact: false }),
  ).toBeVisible();
  expect(parts.length).toBe(before);
  await source.setInputFiles({
    name: "renamed.wav",
    mimeType: "audio/wav",
    buffer: content,
  });
  let entry: {
    version: { id: string; projectId: string | null; sha256: string };
    linked: boolean;
    locations: unknown[];
  };
  await expect
    .poll(
      async () => {
        const response = (
          await (
            await request.get(libraryRoot, { headers: user.headers })
          ).json()
        ).data;
        entry = response.entries[0];
        return response.entries.length;
      },
      { timeout: 45000 },
    )
    .toBe(1);
  expect(parts.slice(before)).toEqual([2]);
  expect(entry!.version.projectId).toBeNull();
  expect(entry!.linked).toBe(false);
  expect(entry!.locations).toEqual([]);
  expect(entry!.version.sha256).toBe(
    createHash("sha256").update(content).digest("hex"),
  );
  await page.reload();
  const row = () => page.getByTestId(`library-file-${entry!.version.id}`);
  await expect(row()).toBeVisible();
  const downloading = page.waitForEvent("download");
  await row().getByRole("button", { name: "원본 받기", exact: true }).click();
  const download = await downloading;
  await download.saveAs("/tmp/prepix-direct-library-original.wav");
  expect(
    createHash("sha256")
      .update(await readFile("/tmp/prepix-direct-library-original.wav"))
      .digest("hex"),
  ).toBe(entry!.version.sha256);
  const project = (
    await (
      await request.post(`${api}/v2/workspaces/${team.id}/b2b/projects`, {
        headers: user.headers,
        data: { requestKey: randomUUID(), name: "직접 보관한 자료 사용" },
      })
    ).json()
  ).data.project;
  const keys: string[] = [];
  await page.route(`**/projects/${project.id}/files/link`, async (route) => {
    const body = route.request().postDataJSON();
    keys.push(body.requestKey);
    expect(body.fromLibrary).toBe(true);
    expect(body.sourceProjectId).toBeUndefined();
    await route.fetch();
    await route.abort("failed");
  });
  const storage = (
    await (
      await request.get(`${libraryRoot}/files/capabilities`, {
        headers: user.headers,
      })
    ).json()
  ).data.storage.usedBytes;
  await row()
    .getByRole("button", { name: "프로젝트에 연결", exact: true })
    .click();
  const dialog = page.getByRole("alertdialog", {
    name: "다른 프로젝트에 연결",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "연결할 프로젝트", exact: true })
    .selectOption(project.id);
  await dialog
    .getByRole("button", { name: "다른 프로젝트에 연결", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 요청 재시도", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("변경이 반영되었습니다.", { exact: false }),
  ).toBeVisible();
  expect(keys).toHaveLength(1);
  const versions = (
    await (
      await request.get(
        `${api}/v2/workspaces/${team.id}/b2b/projects/${project.id}/files`,
        { headers: user.headers },
      )
    ).json()
  ).data.versions;
  expect(versions.map((v: { id: string }) => v.id)).toEqual([
    entry!.version.id,
  ]);
  expect(
    (
      await (
        await request.get(`${libraryRoot}/files/capabilities`, {
          headers: user.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(storage);
  expect(
    (
      await request.get(`${libraryRoot}/files/${entry!.version.id}`, {
        headers: { ...user.headers, "X-Prepix-Account-ID": randomUUID() },
      })
    ).status(),
  ).toBe(403);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "보관함", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "/tmp/prepix-direct-library-mobile.png",
    fullPage: true,
  });
});

test("steward handoff and separate recovery acceptance preserve exact-version privacy across lost replies", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await account(request),
    producer = await account(request),
    successor = await account(request);
  const teamReply = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name: "자료 인계와 복구 인수", requestKey: randomUUID() },
  });
  expect(teamReply.status()).toBe(201);
  const team = (await teamReply.json()).data.workspace;
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
  const projectReply = await request.post(
    `${api}/v2/workspaces/${team.id}/b2b/projects`,
    {
      headers: owner.headers,
      data: { requestKey: randomUUID(), name: "비공개 버전 범위", visibility: "private" },
    },
  );
  expect(projectReply.status()).toBe(201);
  const project = (await projectReply.json()).data.project;
  await invite(request, owner, team.id, project.id, producer, "producer");
  await invite(request, owner, team.id, project.id, successor, "producer");
  const base = `${api}/v2/workspaces/${team.id}/b2b`,
    library = `${base}/library`,
    stewards = `${base}/file-stewards`;
  const libraryPath = `/dashboard/workspaces/${team.id}/library`,
    membersPath = `/dashboard/workspaces/${team.id}/members`;
  const normal = await registerStewardFixture(
    request,
    producer,
    library,
    "handoff-selected.wav",
    16044,
  );
  const linked = await request.post(
    `${base}/projects/${project.id}/files/link`,
    {
      headers: producer.headers,
      data: {
        requestKey: randomUUID(),
        versionId: normal.versionId,
        fromLibrary: true,
      },
    },
  );
  expect(linked.status(), await linked.text()).toBe(201);
  const hidden = await registerStewardFixture(
    request,
    producer,
    `${base}/projects/${project.id}`,
    "private-unselected.wav",
    16060,
    normal.assetId,
  );
  const recovery = await registerStewardFixture(
    request,
    producer,
    library,
    "recovery-private.wav",
    16076,
  );
  // Current role and project participation grant neither private file access
  // nor a right to override a healthy steward.
  expect(
    (
      await request.get(`${library}/files/${normal.versionId}`, {
        headers: owner.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${library}/files/${normal.versionId}`, {
        headers: successor.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${stewards}/recovery/${recovery.versionId}`, {
        headers: owner.headers,
      })
    ).status(),
  ).toBe(403);

  await loginSteward(page, producer, libraryPath);
  const normalRow = () => page.getByTestId(`library-file-${normal.versionId}`);
  await normalRow().getByText("버전 상세와 사용 위치", { exact: true }).click();
  await normalRow()
    .getByRole("button", { name: "버전 주소 복사", exact: true })
    .click();
  const normalAddress = await normalRow()
    .getByLabel("자료 버전 주소", { exact: true })
    .inputValue();
  expect(new URL(normalAddress).searchParams.get("version")).toBe(
    normal.versionId,
  );
  const transferKeys: string[] = [];
  await page.route("**/b2b/file-stewards/transfer", async (route) => {
    transferKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await normalRow()
    .getByRole("button", { name: "자료 담당자 인계", exact: true })
    .click();
  let dialog = page.getByRole("alertdialog", {
    name: "자료 담당자 인계",
    exact: true,
  });
  await dialog
    .getByLabel("내부 후임", { exact: true })
    .selectOption(successor.id);
  await dialog
    .getByLabel("인계 사유", { exact: true })
    .fill("선택 버전만 후임에게 인계");
  await dialog
    .getByLabel("후임에게 선택한 버전의 원본 다운로드도 허용", { exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "이 버전으로 인계", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${library}/files/${normal.versionId}`, {
              headers: producer.headers,
            })
          ).json()
        ).data.version.allowedActions.manage,
    )
    .toBe(false);
  await page.reload();
  await expect(
    page.getByText(
      "자료 인계 변경을 확인했습니다. 현재 자료와 권한을 다시 조회합니다.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(transferKeys).toHaveLength(1);
  await expect(
    normalRow().getByRole("button", { name: "자료 담당자 인계", exact: true }),
  ).toHaveCount(0);
  const transferred = (
    await (
      await request.get(`${library}/files/${normal.versionId}`, {
        headers: successor.headers,
      })
    ).json()
  ).data;
  expect(transferred.version.allowedActions).toMatchObject({
    manage: true,
    download: true,
  });
  expect(
    (
      await request.get(
        `${base}/projects/${project.id}/files/${hidden.versionId}`,
        { headers: successor.headers },
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${library}/files/${hidden.versionId}`, {
        headers: successor.headers,
      })
    ).status(),
  ).toBe(404);
  await loginSteward(
    page,
    successor,
    `${libraryPath}?version=${normal.versionId}`,
  );
  await expect(normalRow()).toHaveCount(1);
  await expect(
    normalRow().getByText("handoff-selected.wav", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("private-unselected.wav", { exact: true }),
  ).toHaveCount(0);

  await loginSteward(page, owner, membersPath);
  // People table (2026-10-08): a person's settings open from their row.
  await page.getByRole("row").filter({ hasText: producer.email }).click();
  const producerMember = page.getByRole("dialog");
  await producerMember
    .getByLabel("참여 변경", { exact: true })
    .selectOption("suspend");
  await producerMember
    .getByLabel("참여 변경 사유", { exact: true })
    .fill("자료 담당자 부재로 후임 복구");
  await producerMember
    .getByRole("button", { name: "참여 변경 확인", exact: true })
    .click();
  await expect(
    producerMember.getByText("참여 정지", { exact: true }),
  ).toBeVisible();
  await producerMember.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("tab", { name: "복구", exact: true }).click();
  const eligibility = (
    await (
      await request.get(`${stewards}/recovery/${recovery.versionId}`, {
        headers: owner.headers,
      })
    ).json()
  ).data;
  for (let i = 0; i < 20; i++) {
    const issued = await request.post(`${stewards}/recoveries`, {
      headers: owner.headers,
      data: {
        requestKey: randomUUID(),
        versionId: recovery.versionId,
        revision: eligibility.revision,
        targetId: successor.id,
        canDownload: false,
        reason: `Archived request ${i}`,
      },
    });
    expect(issued.status()).toBe(201);
    const previous = (await issued.json()).data;
    const cancelled = await request.post(
      `${stewards}/recoveries/${previous.recoveryId}/cancel`,
      {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          reason: "Superseded before acceptance",
        },
      },
    );
    expect(cancelled.status()).toBe(201);
  }
  const recoveryAddress = `${process.env.B2B_E2E_WEB_URL ?? "http://localhost:3001"}${libraryPath}?version=${recovery.versionId}`;
  await page
    .getByLabel("복구할 자료 버전 주소", { exact: true })
    .fill(recoveryAddress);
  await page
    .getByRole("button", { name: "복구 가능 여부 확인", exact: true })
    .click();
  await expect(
    page.getByText(
      "서버가 복구 사유를 확인했습니다. 파일명과 비공개 사용 위치는 표시하지 않습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByLabel("내부 후임", { exact: true })
    .selectOption(successor.id);
  await page
    .getByLabel("인계 사유", { exact: true })
    .fill("정지된 담당자의 선택 버전 복구");
  const requestKeys: string[] = [];
  await page.route("**/b2b/file-stewards/recoveries", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requestKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "후임에게 복구 수락 요청", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "원요청 확인·재시도", exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByText(
        "자료 인계 변경을 확인했습니다. 현재 자료와 권한을 다시 조회합니다.",
        { exact: true },
      )
      .first(),
  ).toBeVisible();
  expect(requestKeys).toHaveLength(1);
  await expect(
    page.getByText("recovery-private.wav", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.get(`${library}/files/${recovery.versionId}`, {
        headers: successor.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(`${library}/files/${recovery.versionId}`, {
        headers: owner.headers,
      })
    ).status(),
  ).toBe(404);
  const offerPage = (
    await (
      await request.get(`${stewards}/recoveries`, {
        headers: successor.headers,
      })
    ).json()
  ).data;
  expect(offerPage.recoveries).toHaveLength(20);
  expect(offerPage.nextCursor).toBeTruthy();
  const offer = offerPage.recoveries.find(
    (r: { state: string }) => r.state === "pending",
  );
  expect(offer).toBeTruthy();
  expect(offer).not.toHaveProperty("name");

  await loginSteward(page, successor, libraryPath);
  const offerRow = () => page.getByTestId(`steward-recovery-${offer.id}`);
  await expect(offerRow()).toBeVisible();
  await page
    .getByRole("button", { name: "다음 복구 요청", exact: true })
    .click();
  await expect(page.getByTestId(/^steward-recovery-/)).toHaveCount(1);
  await expect(offerRow()).toHaveCount(0);
  await page.getByRole("button", { name: "첫 요청 목록", exact: true }).click();
  await expect(offerRow()).toBeVisible();
  await offerRow()
    .getByRole("button", { name: "복구 내용 확인", exact: true })
    .click();
  dialog = page.getByRole("alertdialog", {
    name: "자료 복구 수락",
    exact: true,
  });
  await expect(
    dialog.getByText("원본 다운로드 허용 없음", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/prepix-steward-recovery-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "닫기", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "이 버전의 복구 수락", exact: true }),
  ).toBeFocused();
  const acceptKeys: string[] = [];
  await page.route(
    "**/b2b/file-stewards/recoveries/*/accept",
    async (route) => {
      acceptKeys.push(route.request().postDataJSON().requestKey);
      await route.fetch();
      await route.abort("failed");
    },
  );
  await dialog
    .getByRole("button", { name: "이 버전의 복구 수락", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "원요청 확인·재시도", exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText(
      "자료 인계 변경을 확인했습니다. 현재 자료와 권한을 다시 조회합니다.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(acceptKeys).toHaveLength(1);
  await expect(
    offerRow().getByText("복구 완료", { exact: false }),
  ).toBeVisible();
  const recoveredRow = page.getByTestId(`library-file-${recovery.versionId}`);
  await expect(recoveredRow).toBeVisible();
  await expect(
    recoveredRow.getByRole("button", { name: "원본 받기", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.post(`${library}/files/${recovery.versionId}/download`, {
        headers: successor.headers,
        data: {},
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(`${library}/files/${recovery.versionId}`, {
        headers: owner.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await request.get(
        `${base}/projects/${project.id}/files/${hidden.versionId}`,
        { headers: successor.headers },
      )
    ).status(),
  ).toBe(404);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("trash restoration and irreversible owner deletion preserve exact-version privacy across lost replies", async ({
  page,
  request,
}) => {
  test.setTimeout(150000);
  const owner = await account(request),
    producer = await account(request);
  const teamReply = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name: "휴지통과 영구 삭제 인수", requestKey: randomUUID() },
  });
  expect(teamReply.status()).toBe(201);
  const team = (await teamReply.json()).data.workspace;
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
  const projectReply = await request.post(
    `${api}/v2/workspaces/${team.id}/b2b/projects`,
    {
      headers: owner.headers,
      data: { requestKey: randomUUID(), name: "휴지통 자료의 사용 위치" },
    },
  );
  expect(projectReply.status()).toBe(201);
  const project = (await projectReply.json()).data.project;
  await invite(request, owner, team.id, project.id, producer, "producer");
  const base = `${api}/v2/workspaces/${team.id}/b2b`,
    library = `${base}/library`,
    trash = `${base}/file-trash`,
    libraryPath = `/dashboard/workspaces/${team.id}/library`;
  const original = await registerStewardFixture(
    request,
    producer,
    library,
    "restore-exact.wav",
    32044,
  );
  const hidden = await registerStewardFixture(
    request,
    owner,
    library,
    "owner-private.wav",
    16044,
  );
  await loginSteward(page, producer, libraryPath);
  const row = () => page.getByTestId(`library-file-${original.versionId}`),
    trashRow = () => page.getByTestId(`trash-file-${original.versionId}`);
  await expect(row()).toBeVisible();
  await expect(
    page.getByTestId(`library-file-${hidden.versionId}`),
  ).toHaveCount(0);
  const before = (
    await (
      await request.get(`${library}/files/capabilities`, {
        headers: producer.headers,
      })
    ).json()
  ).data.storage.usedBytes;
  const trashKeys: string[] = [];
  await page.route("**/b2b/file-trash", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    trashKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await row()
    .getByRole("button", { name: "휴지통으로 이동", exact: true })
    .click();
  const move = page.getByRole("alertdialog", {
    name: "버전을 휴지통으로 이동",
    exact: true,
  });
  await move.getByLabel("변경 사유").fill("선택 버전 보관 정리");
  await move
    .getByRole("button", { name: "이 버전을 휴지통으로 이동", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "휴지통 원요청 확인·재시도", exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(row()).toHaveCount(0);
  await expect(trashRow()).toBeVisible();
  expect(trashKeys).toHaveLength(1);
  expect(
    (
      await request.post(`${library}/files/${original.versionId}/download`, {
        headers: producer.headers,
        data: {},
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await (
        await request.get(`${library}/files/capabilities`, {
          headers: producer.headers,
        })
      ).json()
    ).data.storage.usedBytes,
  ).toBe(before);
  await expect(
    trashRow().getByRole("button", { name: "원본 받기", exact: true }),
  ).toHaveCount(0);
  const restoreKeys: string[] = [];
  await page.route("**/b2b/file-trash/entries/*/restore", async (route) => {
    restoreKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await trashRow()
    .getByRole("button", { name: "버전 복원", exact: true })
    .click();
  const restore = page.getByRole("alertdialog", {
    name: "휴지통 버전 복원",
    exact: true,
  });
  await restore.getByLabel("변경 사유").fill("정확한 이전 버전 복원");
  await restore
    .getByRole("button", { name: "이 버전 복원", exact: true })
    .click();
  await expect(
    page
      .getByRole("button", { name: "휴지통 원요청 확인·재시도", exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(row()).toBeVisible();
  await expect(trashRow()).toHaveCount(0);
  expect(restoreKeys).toHaveLength(1);
  await page.unroute("**/b2b/file-trash");
  await page.unroute("**/b2b/file-trash/entries/*/restore");
  await row()
    .getByRole("button", { name: "휴지통으로 이동", exact: true })
    .click();
  await move.getByLabel("변경 사유").fill("소유자 영구 삭제를 위한 정리");
  await move
    .getByRole("button", { name: "이 버전을 휴지통으로 이동", exact: true })
    .click();
  await expect(trashRow()).toBeVisible();
  await expect(row()).toHaveCount(0);
  const current = (
    await (await request.get(trash, { headers: producer.headers })).json()
  ).data.entries.find(
    (entry: { version: { id: string } }) =>
      entry.version.id === original.versionId,
  );
  expect(current).toBeTruthy();
  await loginSteward(page, owner, libraryPath);
  await expect(trashRow()).toHaveCount(0);
  const address = new URL(
    libraryPath,
    process.env.B2B_E2E_WEB_URL ?? "http://localhost:3001",
  );
  address.searchParams.set("version", original.versionId);
  await page
    .getByLabel("영구 삭제할 버전 주소", { exact: true })
    .fill(address.toString());
  await page
    .getByRole("button", { name: "삭제 영향 확인", exact: true })
    .click();
  const purge = page.getByRole("alertdialog", {
    name: "영구 삭제 확인",
    exact: true,
  });
  await expect(purge).toBeVisible();
  await expect(purge).not.toContainText("restore-exact.wav");
  const confirmation = purge.getByRole("button", {
    name: "복원 불가 영구 삭제 요청",
    exact: true,
  });
  await expect(confirmation).toBeDisabled();
  await purge.getByLabel("변경 사유").fill("요청한 버전 영구 삭제 확인");
  await purge.getByRole("checkbox").check();
  const purgeKeys: string[] = [];
  await page.route("**/b2b/file-trash/entries/*/purge", async (route) => {
    purgeKeys.push(route.request().postDataJSON().requestKey);
    await route.fetch();
    await route.abort("failed");
  });
  await confirmation.click();
  await expect(
    page
      .getByRole("button", { name: "휴지통 원요청 확인·재시도", exact: true })
      .first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("휴지통 변경 결과를 확인했습니다.", { exact: true }).first(),
  ).toBeVisible();
  expect(purgeKeys).toHaveLength(1);
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`${library}/files/capabilities`, {
              headers: owner.headers,
            })
          ).json()
        ).data.storage.usedBytes,
      { timeout: 20000 },
    )
    .toBe(String(16044));
  expect(
    (
      await request.post(`${trash}/entries/${current.id}/restore`, {
        headers: producer.headers,
        data: {
          requestKey: randomUUID(),
          revision: 1,
          reason: "Irreversible",
          fromLibrary: true,
        },
      })
    ).status(),
  ).toBe(409);
  await expect(
    page.getByTestId(`library-file-${hidden.versionId}`),
  ).toBeVisible();
});
