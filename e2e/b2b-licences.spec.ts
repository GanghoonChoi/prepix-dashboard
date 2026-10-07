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
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const api = harnessEnv("B2B_E2E_API_URL"),
  password = "LocalPreview123";
const backend = createRequire(
  resolve("../prepix-backend/backend/package.json"),
);
const { inputHash } = backend("./dist/b2b/policy");
const { registrationProof, grantProof, acknowledgementProof } = backend(
  "./dist/b2b/device-crypto",
);
function paidFixture(input: object) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        resolve("../prepix-backend/backend/scripts/b2b-paid-test-fixture.cjs"),
        JSON.stringify(input),
      ],
      { encoding: "utf8", timeout: 15000 },
    ),
  );
}
async function account(request: APIRequestContext, label: string) {
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
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/request`, { headers })
    ).status(),
  ).toBe(200);
  let message: { verifyUrl: string } | undefined;
  await expect
    .poll(async () => {
      const mailbox = await (await request.get(`${api}/__test/mail`)).json();
      message = mailbox.findLast(
        (m: { to: string; verifyUrl?: string }) =>
          m.to === email && m.verifyUrl,
      );
      return message?.verifyUrl;
    })
    .toBeTruthy();
  expect(
    (
      await request.post(`${api}/v2/auth/email/verify/confirm`, {
        data: { token: new URL(message!.verifyUrl).searchParams.get("token") },
      })
    ).status(),
  ).toBe(200);
  return { email, label, id: session.user.id as string, headers };
}
async function signIn(page: Page, email: string, target: string) {
  await page.goto(`/login?locale=ko&returnTo=${encodeURIComponent(target)}`);
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(target));
}
async function device(
  request: APIRequestContext,
  workspaceId: string,
  user: Awaited<ReturnType<typeof account>>,
  projectId: string,
) {
  const pair = generateKeyPairSync("ed25519"),
    deviceId = randomUUID(),
    publicKey = pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url"),
    base = `${api}/v2/workspaces/${workspaceId}/b2b/licences/devices`;
  const proof = (value: unknown) =>
    sign(null, Buffer.from(inputHash(value)), pair.privateKey).toString(
      "base64url",
    );
  const registration = { requestKey: randomUUID(), deviceId, publicKey };
  expect(
    (
      await request.post(base, {
        headers: user.headers,
        data: {
          ...registration,
          signature: proof(
            registrationProof(workspaceId, user.id, registration),
          ),
        },
      })
    ).status(),
  ).toBe(201);
  const challenge = (
    await (
      await request.post(`${base}/challenges`, {
        headers: user.headers,
        data: { requestKey: randomUUID(), deviceId, projectId },
      })
    ).json()
  ).data;
  const input = {
      requestKey: randomUUID(),
      deviceId,
      projectId,
      challengeId: challenge.challengeId,
    },
    signed = {
      ...input,
      signature: proof(grantProof(workspaceId, user.id, input)),
    };
  const issued = await request.post(`${base}/grants`, {
    headers: user.headers,
    data: signed,
  });
  expect(issued.status()).toBe(201);
  const grant = (await issued.json()).data.grant;
  return {
    deviceId,
    grant,
    signed,
    ack: async () => {
      const input = {
        requestKey: randomUUID(),
        deviceId,
        grantIds: [grant.id],
      };
      expect(
        (
          await request.post(`${base}/acknowledge`, {
            data: {
              ...input,
              signature: proof(acknowledgementProof(workspaceId, input)),
            },
          })
        ).status(),
      ).toBe(201);
    },
  };
}
async function invite(
  request: APIRequestContext,
  workspaceId: string,
  owner: Awaited<ReturnType<typeof account>>,
  user: Awaited<ReturnType<typeof account>>,
  projectId?: string,
) {
  expect(
    (
      await request.post(
        `${api}/v2/workspaces/${workspaceId}/b2b/invitations`,
        {
          headers: owner.headers,
          data: {
            requestKey: randomUUID(),
            email: user.email,
            kind: projectId ? "external" : "internal",
            teamRole: "editor",
            projectId,
            projectRole: projectId ? "producer" : undefined,
            canDownload: false,
          },
        },
      )
    ).status(),
  ).toBe(201);
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(
      async () => {
        const mailbox = await (await request.get(`${api}/__test/mail`)).json();
        offer = mailbox.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === user.email && m.inviteUrl?.includes("/b2b-invitations/"),
        );
        return offer?.inviteUrl;
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  const token = new URL(offer!.inviteUrl).pathname.split("/").at(-1);
  expect(
    (
      await request.post(`${api}/v2/b2b/invitations/${token}/accept`, {
        headers: user.headers,
      })
    ).status(),
  ).toBe(201);
}

test("purchased capacity, lost-response assignment, independent limits, private self-view and every-device revocation", async ({
  page,
  request,
  browser,
}, testInfo) => {
  test.setTimeout(120000);
  const owner = await account(request, "licence-owner"),
    guest = await account(request, "licence-guest"),
    staff = await account(request, "licence-staff");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "이용권 브라우저 검증", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace;
  const base = `/dashboard/workspaces/${team.id}/licences`,
    endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const status = (
    await (
      await request.get(`${endpoint}/status`, { headers: owner.headers })
    ).json()
  ).data;
  test.skip(
    !status.enrolled,
    "Requires B2B_TEST_NEW_TEAMS=true and B2B_TEST_PRODUCT=true local preview",
  );
  await signIn(page, owner.email, base);
  await expect(
    page.getByText(/첫 구매가 반영된 뒤 이용권을 배정/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "이용권 배정", exact: true }),
  ).toHaveCount(0);
  const { periodId } = paidFixture({
    workspaceId: team.id,
    action: "purchase",
    target: "initial",
  });
  const project = (
    await (
      await request.post(`${endpoint}/projects`, {
        headers: owner.headers,
        data: { requestKey: randomUUID(), name: "제작 연결" },
      })
    ).json()
  ).data.project;
  await invite(request, team.id, owner, guest, project.id);
  await invite(request, team.id, owner, staff);
  expect(
    (
      await request.post(`${endpoint}/licences/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId,
          userId: owner.id,
          limitUnits: 2000,
        },
      })
    ).status(),
  ).toBe(201);
  await page.reload();
  const current = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "현재 구매 기간", exact: true }),
    })
    .first();
  const form = current.getByRole("form", {
    name: "편집 이용권 배정",
    exact: true,
  });
  await form.getByLabel("배정 대상", { exact: true }).selectOption(guest.id);
  await form.getByRole("button", { name: /균등 제안 적용/ }).click();
  await expect(form.getByLabel(/개인 AI 한도/)).toHaveValue("3000");
  await form.getByLabel(/개인 AI 한도/).fill("1000");
  let original: unknown,
    assignedId = "",
    assignCalls = 0;
  await page.route(`${endpoint}/licences/assignments`, async (route) => {
    const input = route.request().postDataJSON();
    if (assignCalls++ === 0) {
      original = input;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      assignedId = (await response.json()).data.assignment.id;
      return route.abort();
    }
    expect(input).toEqual(original);
    return route.continue();
  });
  await form.getByRole("button", { name: "이용권 배정", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "같은 배정 다시 확인", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    current.getByRole("region", {
      name: "licence-guest · 배정 중",
      exact: true,
    }),
  ).toBeVisible();
  await expect(form.getByLabel("배정 대상", { exact: true })).toBeDisabled();
  await expect(form.getByLabel(/개인 AI 한도/)).toHaveValue("1000");
  await form
    .getByRole("button", { name: "같은 배정 다시 확인", exact: true })
    .click();
  await expect(form.getByRole("status")).toContainText("변경을 확인했습니다");
  await page.unroute(`${endpoint}/licences/assignments`);
  expect(
    (
      await request.post(`${endpoint}/licences/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId,
          userId: staff.id,
          limitUnits: 2000,
        },
      })
    ).status(),
  ).toBe(201);
  const d1 = await device(request, team.id, guest, project.id),
    d2 = await device(request, team.id, guest, project.id);
  paidFixture({
    workspaceId: team.id,
    action: "usage",
    periodId,
    userId: guest.id,
    confirmedUnits: 500,
    reservedUnits: 200,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(form.getByText(/배정 가능 정원이 없습니다/)).toBeVisible();
  const budget = current.getByRole("region", {
    name: "licence-guest · 개인 AI 한도",
    exact: true,
  });
  await budget.getByText("개인 AI 한도 변경", { exact: true }).click();
  await budget.getByLabel(/변경할 AI 한도/).fill("699");
  await budget
    .getByLabel("한도 변경 사유", { exact: true })
    .fill("새 개인 한도");
  await expect(
    budget.getByRole("button", { name: "AI 한도 저장", exact: true }),
  ).toBeDisabled();
  await budget.getByLabel(/변경할 AI 한도/).fill("700");
  let limitCalls = 0,
    originalLimit: unknown;
  await page.route(
    `${endpoint}/licences/periods/${periodId}/users/${guest.id}/limit`,
    async (route) => {
      if (limitCalls++ === 0) {
        originalLimit = route.request().postDataJSON();
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        return route.abort();
      }
      expect(route.request().postDataJSON()).toEqual(originalLimit);
      return route.continue();
    },
  );
  await budget
    .getByRole("button", { name: "AI 한도 저장", exact: true })
    .click();
  await expect(
    budget.getByRole("button", {
      name: "같은 한도 변경 다시 확인",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(budget.getByLabel(/변경할 AI 한도/)).toBeDisabled();
  await budget
    .getByRole("button", { name: "같은 한도 변경 다시 확인", exact: true })
    .click();
  await expect(budget.getByRole("status")).toContainText("변경을 확인했습니다");
  const guestContext = await browser.newContext({ locale: "ko-KR" }),
    guestPage = await guestContext.newPage();
  try {
    await signIn(guestPage, guest.email, base);
    await expect(
      guestPage.getByRole("heading", { name: "내 편집 이용권", exact: true }),
    ).toBeVisible();
    await expect(
      guestPage.locator("main").getByText("licence-owner", { exact: true }),
    ).toHaveCount(0);
    await expect(
      guestPage.locator("main").getByText("licence-staff", { exact: true }),
    ).toHaveCount(0);
    await expect(
      guestPage.getByRole("button", { name: "이용권 배정", exact: true }),
    ).toHaveCount(0);
    const own = (
      await (
        await request.get(`${endpoint}/licences/mine`, {
          headers: guest.headers,
        })
      ).json()
    ).data;
    expect(
      own.assignments.every((a: { userId: string }) => a.userId === guest.id),
    ).toBe(true);
    expect(own.deviceWaits[0].deviceCount).toBe(2);
    expect(
      (
        await request.get(`${endpoint}/licences`, { headers: guest.headers })
      ).status(),
    ).toBe(403);
  } finally {
    await guestContext.close();
  }
  const row = current.getByRole("region", {
    name: "licence-guest · 배정 중",
    exact: true,
  });
  await row.getByText("이용권 회수·예정 회수 변경", { exact: true }).click();
  await row.getByLabel("변경 사유", { exact: true }).fill("교체를 위한 회수");
  let revokeCalls = 0,
    originalRevoke: unknown;
  await page.route(
    `${endpoint}/licences/assignments/${assignedId}/revoke`,
    async (route) => {
      if (revokeCalls++ === 0) {
        originalRevoke = route.request().postDataJSON();
        const response = await route.fetch();
        expect((await response.json()).data.assignment.state).toBe("revoking");
        return route.abort();
      }
      expect(route.request().postDataJSON()).toEqual(originalRevoke);
      return route.continue();
    },
  );
  await row
    .getByRole("button", { name: "회수 변경 확인", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const waiting = current.getByRole("region", {
    name: "licence-guest · 회수 대기",
    exact: true,
  });
  await expect(waiting.getByText(/2개 장치의 종료를 기다립니다/)).toBeVisible();
  await expect(
    waiting.getByRole("button", {
      name: "같은 회수 요청 다시 확인",
      exact: true,
    }),
  ).toBeVisible();
  await waiting
    .getByRole("button", { name: "같은 회수 요청 다시 확인", exact: true })
    .click();
  expect(
    (
      await request.post(`${endpoint}/licences/devices/grants`, {
        headers: guest.headers,
        data: d1.signed,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get(`${endpoint}/projects/${project.id}`, {
        headers: guest.headers,
      })
    ).status(),
  ).toBe(200);
  await page.screenshot({
    path: "/tmp/prepix-b2b-licences-web.png",
    fullPage: false,
  });
  await testInfo.attach("licence-capacity-and-device-pending", {
    path: "/tmp/prepix-b2b-licences-web.png",
    contentType: "image/png",
  });
  await d1.ack();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(waiting.getByText(/1개 장치의 종료를 기다립니다/)).toBeVisible();
  await d2.ack();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    current.getByRole("region", {
      name: "licence-guest · 회수 완료",
      exact: true,
    }),
  ).toBeVisible();
  await form.getByLabel("배정 대상", { exact: true }).selectOption(guest.id);
  await expect(form.getByLabel(/개인 AI 한도/)).toHaveValue("700");
  await expect(form.getByLabel(/개인 AI 한도/)).toHaveAttribute("readonly", "");
  await form.getByRole("button", { name: "이용권 배정", exact: true }).click();
  const after = (
    await (
      await request.get(`${endpoint}/licences`, { headers: owner.headers })
    ).json()
  ).data;
  const retained = after.budgets.find(
    (b: { userId: string }) => b.userId === guest.id,
  );
  expect(retained.confirmedUnits).toBe(500);
  expect(retained.reservedUnits).toBe(200);
  expect(retained.limitUnits).toBe(700);
  const { periodId: nextPeriodId } = paidFixture({
    workspaceId: team.id,
    action: "purchase",
    target: "next",
    sourcePeriodId: periodId,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const future = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "구매한 다음 기간", exact: true }),
    })
    .first();
  await future.getByLabel("배정 대상", { exact: true }).selectOption(guest.id);
  await future.getByLabel(/개인 AI 한도/).fill("900");
  await future
    .getByRole("button", { name: "이용권 배정", exact: true })
    .click();
  await expect(
    future.getByRole("region", {
      name: "licence-guest · 다음 기간 배정",
      exact: true,
    }),
  ).toBeVisible();
  const saved = (
    await (
      await request.get(`${endpoint}/licences`, { headers: owner.headers })
    ).json()
  ).data;
  expect(
    saved.periods.find((p: { id: string }) => p.id === nextPeriodId).capacity,
  ).toBe(3);
  const personalContext = await browser.newContext({
    locale: "ko-KR",
    viewport: { width: 390, height: 844 },
  });
  const personalPage = await personalContext.newPage();
  try {
    await signIn(personalPage, guest.email, base);
    const ownCurrent = personalPage
      .locator("section")
      .filter({
        has: personalPage.getByRole("heading", {
          name: "현재 이용권 기간",
          exact: true,
        }),
      })
      .first();
    const ownNext = personalPage
      .locator("section")
      .filter({
        has: personalPage.getByRole("heading", {
          name: "다음 이용권 기간",
          exact: true,
        }),
      })
      .first();
    await expect(
      ownCurrent.getByRole("region", {
        name: "내 한도 · 개인 AI 한도",
        exact: true,
      }),
    ).toContainText("700 검증 단위");
    await expect(
      ownNext.getByRole("region", {
        name: "내 한도 · 개인 AI 한도",
        exact: true,
      }),
    ).toContainText("900 검증 단위");
    await expect(
      ownNext.getByText(
        "시작 시각 전에는 이 이용권과 한도를 사용할 수 없습니다.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      personalPage.locator("main").getByText("licence-owner", { exact: true }),
    ).toHaveCount(0);
    expect(
      await personalPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await personalPage.screenshot({
      path: "/tmp/prepix-b2b-licences-mobile.png",
      fullPage: true,
    });
  } finally {
    await personalContext.close();
  }
});

test("own device retirement survives a lost response and keeps replacement capacity until device proof", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const owner = await account(request, "device-owner"),
    staff = await account(request, "device-staff");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "장치 교체 검증", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace;
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`,
    base = `/dashboard/workspaces/${team.id}/licences`;
  const status = (
    await (
      await request.get(`${endpoint}/status`, { headers: owner.headers })
    ).json()
  ).data;
  test.skip(!status.enrolled, "Requires local B2B product and devices preview");
  const { periodId } = paidFixture({
    workspaceId: team.id,
    action: "purchase",
    target: "initial",
  });
  const project = (
    await (
      await request.post(`${endpoint}/projects`, {
        headers: owner.headers,
        data: { name: "Device project", requestKey: randomUUID() },
      })
    ).json()
  ).data.project;
  await invite(request, team.id, owner, staff, project.id);
  for (const user of [owner, staff])
    expect(
      (
        await request.post(`${endpoint}/licences/assignments`, {
          headers: owner.headers,
          data: {
            requestKey: randomUUID(),
            periodId,
            userId: user.id,
            limitUnits: 1000,
          },
        })
      ).status(),
    ).toBe(201);
  const d1 = await device(request, team.id, owner, project.id),
    d2 = await device(request, team.id, owner, project.id);
  await device(request, team.id, owner, project.id);
  const staffDevice = await device(request, team.id, staff, project.id);
  await signIn(page, owner.email, base);
  const devices = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "내 등록 장치", exact: true }),
    })
    .first();
  await expect(
    devices.getByText(staffDevice.deviceId, { exact: false }),
  ).toHaveCount(0);
  await expect(devices.getByText(/사용 중·해제 대기 3 \/ 3/)).toBeVisible();
  const active = devices.getByRole("region", {
    name: `장치 ${d1.deviceId.slice(0, 8)} · 사용 중`,
    exact: true,
  });
  await active.getByText("장치 등록 해제", { exact: true }).click();
  await active
    .getByLabel("등록 해제 사유", { exact: true })
    .fill("사용하지 않는 장치 교체");
  let calls = 0,
    original: unknown;
  await page.route(
    `${endpoint}/licences/devices/${d1.deviceId}/retire`,
    async (route) => {
      if (calls++ === 0) {
        original = route.request().postDataJSON();
        expect((await route.fetch()).status()).toBe(201);
        return route.abort();
      }
      expect(route.request().postDataJSON()).toEqual(original);
      return route.continue();
    },
  );
  await active
    .getByRole("button", { name: "장치 해제 확인", exact: true })
    .click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const waiting = devices.getByRole("region", {
    name: `장치 ${d1.deviceId.slice(0, 8)} · 등록 해제 대기`,
    exact: true,
  });
  await expect(waiting.getByText(/1개 허가의 반납을 기다립니다/)).toBeVisible();
  await expect(
    waiting.getByLabel("등록 해제 사유", { exact: true }),
  ).toHaveValue("사용하지 않는 장치 교체");
  await expect(
    waiting.getByLabel("등록 해제 사유", { exact: true }),
  ).toBeDisabled();
  await waiting
    .getByRole("button", { name: "같은 장치 해제 다시 확인", exact: true })
    .click();
  await expect(
    waiting.getByRole("status").filter({ hasText: "변경을 확인했습니다" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  expect(
    (
      await request.post(`${endpoint}/licences/devices/grants`, {
        headers: owner.headers,
        data: d1.signed,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(`${endpoint}/licences/devices/grants`, {
        headers: owner.headers,
        data: d2.signed,
      })
    ).status(),
  ).toBe(201);
  const pair = generateKeyPairSync("ed25519");
  const replacement = {
    requestKey: randomUUID(),
    deviceId: randomUUID(),
    publicKey: pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url"),
  };
  const registration = {
    ...replacement,
    signature: sign(
      null,
      Buffer.from(inputHash(registrationProof(team.id, owner.id, replacement))),
      pair.privateKey,
    ).toString("base64url"),
  };
  expect(
    (
      await request.post(`${endpoint}/licences/devices`, {
        headers: owner.headers,
        data: registration,
      })
    ).status(),
  ).toBe(409);
  await devices.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/tmp/prepix-b2b-device-retirement-web.png",
    fullPage: false,
  });
  await d1.ack();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    devices.getByRole("region", {
      name: `장치 ${d1.deviceId.slice(0, 8)} · 등록 해제 완료`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(devices.getByText(/사용 중·해제 대기 2 \/ 3/)).toBeVisible();
  expect(
    (
      await request.post(`${endpoint}/licences/devices`, {
        headers: owner.headers,
        data: registration,
      })
    ).status(),
  ).toBe(201);
  const own = (
    await (
      await request.get(`${endpoint}/licences/devices`, {
        headers: owner.headers,
      })
    ).json()
  ).data;
  expect(
    own.devices.filter((d: { state: string }) => d.state !== "retired"),
  ).toHaveLength(3);
  expect(
    own.devices.find((d: { id: string }) => d.id === d1.deviceId).state,
  ).toBe("retired");
  const licences = (
    await (
      await request.get(`${endpoint}/licences/mine`, { headers: owner.headers })
    ).json()
  ).data;
  expect(licences.assignments[0].state).toBe("active");
});

test("a revocation response lost after immediate release stays retryable across a failed refresh and a changed roster", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  const owner = await account(request, "licence-close-owner");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "회수 결과 보존", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace;
  const { periodId } = paidFixture({
    workspaceId: team.id,
    action: "purchase",
    target: "initial",
  });
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b/licences`,
    base = `/dashboard/workspaces/${team.id}/licences`;
  const assigned = (
    await (
      await request.post(`${endpoint}/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId,
          userId: owner.id,
          limitUnits: 2000,
        },
      })
    ).json()
  ).data.assignment;
  await signIn(page, owner.email, base);
  const row = page.getByRole("region", {
    name: "licence-close-owner · 배정 중",
    exact: true,
  });
  await row.getByText("이용권 회수·예정 회수 변경", { exact: true }).click();
  await row
    .getByLabel("변경 사유", { exact: true })
    .fill("모든 장치 없는 즉시 회수");
  let calls = 0,
    original: unknown;
  await page.route(
    `${endpoint}/assignments/${assigned.id}/revoke`,
    async (route) => {
      if (calls++ === 0) {
        original = route.request().postDataJSON();
        const response = await route.fetch();
        expect((await response.json()).data.assignment.state).toBe("released");
        return route.abort();
      }
      expect(route.request().postDataJSON()).toEqual(original);
      return route.continue();
    },
  );
  await row
    .getByRole("button", { name: "회수 변경 확인", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "같은 회수 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page.route(endpoint, (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("변경 사유", { exact: true })).toHaveValue(
    "모든 장치 없는 즉시 회수",
  );
  await expect(page.getByLabel("변경 사유", { exact: true })).toBeDisabled();
  await page.unroute(endpoint);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByRole("region", {
      name: "licence-close-owner · 회수 완료",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "같은 회수 요청 다시 확인", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "같은 회수 요청 다시 확인", exact: true })
    .click();
  expect(calls).toBe(2);
  await expect(
    page.getByRole("button", { name: "같은 회수 요청 다시 확인", exact: true }),
  ).toHaveCount(0);
});
