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
/** 멤버 = 좌석 (2026-10-08): a purchase seats the owner by itself; this is
 * that seat, read back rather than assigned by hand. */
async function ownSeat(
  request: APIRequestContext,
  licences: string,
  owner: Awaited<ReturnType<typeof account>>,
) {
  const { assignments } = (
    await (await request.get(licences, { headers: owner.headers })).json()
  ).data as { assignments: { id: string; userId: string; state: string; revision: number }[] };
  const seat = assignments.find(
    (a) => a.userId === owner.id && a.state === "active",
  );
  expect(seat, "the purchase seats the owner").toBeTruthy();
  return seat!;
}
async function invite(
  request: APIRequestContext,
  workspaceId: string,
  owner: Awaited<ReturnType<typeof account>>,
  user: Awaited<ReturnType<typeof account>>,
  projectId?: string,
  team: { role?: "editor" | "reviewer"; seat?: boolean } = {},
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
            teamRole: team.role ?? "editor",
            projectId,
            projectRole: projectId ? "producer" : undefined,
            canDownload: false,
            assignSeat: team.seat,
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
    base = `/dashboard/workspaces/${team.id}`;
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
  await ownSeat(request, `${endpoint}/licences`, owner);
  expect(
    (
      await request.post(`${endpoint}/licences/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId,
          userId: staff.id,
        },
      })
    ).status(),
  ).toBe(201);
  const d1 = await device(request, team.id, owner, project.id),
    d2 = await device(request, team.id, owner, project.id);
  await device(request, team.id, owner, project.id);
  const staffDevice = await device(request, team.id, staff, project.id);
  // 내 등록 장치 lives on the team home under 내 좌석 (2026-10-08).
  await signIn(page, owner.email, base);
  const devices = page.getByRole("region", { name: "내 등록 장치", exact: true });
  await expect(
    devices.getByText(staffDevice.deviceId.slice(0, 8), { exact: false }),
  ).toHaveCount(0);
  await expect(devices.getByText("3 / 3", { exact: true })).toBeVisible();
  const row = (id: string) =>
    devices.getByRole("listitem").filter({ hasText: `장치 ${id.slice(0, 8)}` });
  let calls = 0;
  await page.route(
    `${endpoint}/licences/devices/${d1.deviceId}/retire`,
    async (route) => {
      calls++;
      // The answer is lost; the change lands and the reread shows it.
      expect((await route.fetch()).status()).toBe(201);
      return route.abort();
    },
  );
  await row(d1.deviceId).getByRole("button", { name: "등록 해제", exact: true }).click();
  await expect(row(d1.deviceId).getByText(/해제 중/)).toBeVisible();
  expect(calls).toBe(1);
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
  await d1.ack();
  await page.reload();
  await expect(row(d1.deviceId)).toHaveCount(0);
  await expect(devices.getByText("2 / 3", { exact: true })).toBeVisible();
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

test("멤버 = 좌석: joining takes a seat, the fourth waits, turning one off hands it on, reviewers need none", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const owner = await account(request, "seat-owner"),
    a = await account(request, "seat-a"),
    b = await account(request, "seat-b"),
    c = await account(request, "seat-c"),
    r = await account(request, "seat-reviewer");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "좌석 자동 배정", requestKey: randomUUID() },
      })
    ).json()
  ).data.workspace;
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const status = (
    await (await request.get(`${endpoint}/status`, { headers: owner.headers })).json()
  ).data;
  test.skip(!status.enrolled, "Requires B2B_TEST_NEW_TEAMS=true and B2B_TEST_PRODUCT=true local preview");
  paidFixture({ workspaceId: team.id, action: "purchase", target: "initial" });
  // Three seats: the owner took one with the purchase; a and b take the rest.
  for (const u of [a, b, c]) await invite(request, team.id, owner, u, undefined, { seat: true });
  await invite(request, team.id, owner, r, undefined, { role: "reviewer" });
  const roster = async () =>
    (await (await request.get(`${endpoint}/members`, { headers: owner.headers })).json()).data as {
      seats: { capacity: number; assigned: number; waiting: number };
      people: { userId: string; seat: string }[];
    };
  const seatOf = async (id: string) => (await roster()).people.find((p) => p.userId === id)?.seat;
  expect((await roster()).seats).toEqual({ capacity: 3, assigned: 3, waiting: 1 });
  expect(await seatOf(c.id)).toBe("waiting");
  expect(await seatOf(r.id)).toBe("none");

  await signIn(page, owner.email, `/dashboard/workspaces/${team.id}/members`);
  const row = (email: string) => page.getByRole("row").filter({ hasText: email });
  // 멤버 = 결제 (2026-10-08): no seat column; who waits says so, and the
  // shortage is offered for payment right on this page.
  const shortage = page.getByTestId("seat-shortage");
  await expect(shortage).toContainText("1명이 좌석을 기다리고");
  await expect(row(c.email).getByText("좌석 대기", { exact: true })).toBeVisible();
  await expect(row(a.email).getByText("좌석 대기", { exact: true })).toHaveCount(0);
  // The seat follows the role (2026-10-08): making a a viewer hands their
  // seat to c, who was waiting.
  await row(a.email).getByLabel(/역할$/).selectOption("reviewer");
  await expect(row(c.email).getByText("좌석 대기", { exact: true })).toHaveCount(0);
  await expect(shortage).toHaveCount(0);
  expect((await roster()).seats).toEqual({ capacity: 3, assigned: 3, waiting: 0 });
  // Back to editor with every seat taken: a waits, and the owner is offered
  // the seat at once. No card is on automatic renewal here, so it points to
  // the plan instead of charging.
  await row(a.email).getByLabel(/역할$/).selectOption("editor");
  await expect(row(a.email).getByText("좌석 대기", { exact: true })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "좌석 1개 추가" });
  await expect(dialog).toContainText("자동 결제에 등록된 카드가 없어");
  await expect(dialog.getByRole("link", { name: "플랜으로 이동" })).toBeVisible();
  await page.keyboard.press("Escape");
  // With a card on renewal: the real quote for the rest of the month, one
  // charge, then the dialog waits for the seats to be applied.
  const methodId = randomUUID();
  await page.route(/\/b2b\/billing$/, async (route) => {
    const body = await (await route.fetch()).json();
    body.data.renewal = { ...body.data.renewal, mode: "automatic", methodId };
    body.data.methods = [{ id: methodId, state: "active", cardNumberMasked: "4330****1234****" }];
    await route.fulfill({ json: body });
  });
  let charged: { quoteId?: string } = {};
  const orderId = randomUUID();
  await page.route(/\/b2b\/billing\/charge$/, async (route) => {
    charged = route.request().postDataJSON();
    await route.fulfill({ json: { data: { order: { id: orderId, state: "received" } } } });
  });
  await page.route(new RegExp(`/commerce/orders/${orderId}$`), (route) =>
    route.fulfill({ json: { data: { order: { id: orderId, state: "applied" } } } }),
  );
  await shortage.getByRole("button", { name: "좌석 1개 추가" }).click();
  await expect(dialog).toContainText("4330****1234****");
  const pay = dialog.getByRole("button", { name: /원 결제$/ });
  await expect(pay).toBeVisible();
  await pay.click();
  await expect(dialog).toHaveCount(0);
  expect(charged.quoteId).toMatch(/^[0-9a-f-]{36}$/);
  // A viewer has no seat to turn on.
  await expect(row(r.email).getByRole("button", { name: "좌석 켜기", exact: true })).toHaveCount(0);
  expect(
    (
      await request.post(`${endpoint}/members/${r.id}/seat`, {
        headers: owner.headers,
        data: { requestKey: randomUUID(), editing: true },
      })
    ).status(),
  ).toBe(422);
});
