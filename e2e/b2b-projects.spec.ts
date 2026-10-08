import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { harnessEnv } from "./harness-env";
// The backend fixtures this spec runs fall back to a shared PG (55438) when unset.
harnessEnv("WORKSPACES_TEST_DATABASE_URL");
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
const api = harnessEnv("B2B_E2E_API_URL");
const password = "LocalPreview123";
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function fixture(input: object) {
  execFileSync(
    process.execPath,
    [
      resolve("../prepix-backend/backend/scripts/b2b-test-fixture.cjs"),
      JSON.stringify(input),
    ],
    { timeout: 15_000 },
  );
}
async function account(request: APIRequestContext, label: string) {
  const email = `${label}-${suffix()}@example.test`;
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
  return {
    email,
    id: session.user.id as string,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  };
}
async function signIn(page: Page, email: string) {
  await page.goto("/login?returnTo=%2Fdashboard%2Fworkspaces&locale=ko");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
}
test("B2B preparing gate, private projects, lost-response retry, role handoff and immediate revocation", async ({
  page,
  request,
  browser,
}, testInfo) => {
  const owner = await account(request, "b2b-owner");
  const editor = await account(request, "b2b-editor");
  const created = await request.post(`${api}/v2/workspaces`, {
    headers: owner.headers,
    data: { name: `B2B ${suffix()}` },
  });
  expect(created.status()).toBe(201);
  const team = (await created.json()).data.workspace;
  const base = `/dashboard/workspaces/${team.id}`;
  expect(
    (
      await request.post(`${api}/v2/workspaces/${team.id}/b2b/enroll`, {
        headers: owner.headers,
        data: {
          revision: 0,
          requestKey: crypto.randomUUID(),
          reason: "Local B2B acceptance fixture",
        },
      })
    ).status(),
  ).toBe(201);
  await signIn(page, owner.email);
  await page.goto(base);
  await expect(
    page.getByText("첫 이용권 반영 전에는 이용기간이 시작되지 않습니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "프로젝트", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${base}/projects/new`);
  await expect(page.locator("main [role=alert]")).toBeVisible();
  fixture({ workspaceId: team.id, action: "activate" });
  fixture({ workspaceId: team.id, action: "join", userId: editor.id });
  const editorContext = await browser.newContext({ locale: "ko-KR" });
  const editorPage = await editorContext.newPage();
  const browserErrors: string[] = [];
  editorPage.on("pageerror", (e) => browserErrors.push(e.message));
  try {
    await signIn(editorPage, editor.email);
    await editorPage.goto(`${base}/projects/new`);
    await editorPage
      .getByLabel("프로젝트명", { exact: true })
      .fill("Private B2B project");
    await editorPage
      .getByLabel("작업 개요", { exact: true })
      .fill("Only invited people may see this brief");
    // V: the owner-must-not-see assertions below are the private (v1) rule.
    await editorPage.getByRole("radio", { name: /^비공개\(참여자만\)/ }).check();
    const endpoint = `${api}/v2/workspaces/${team.id}/b2b/projects`;
    let lost = true;
    await editorPage.route(endpoint, async (route) => {
      if (route.request().method() === "POST" && lost) {
        lost = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await editorPage
      .getByRole("button", { name: "프로젝트 만들기", exact: true })
      .click();
    await expect(editorPage.locator("main [role=alert]")).toContainText(
      "요청을 완료하지 못했습니다",
    );
    await expect(
      editorPage.getByLabel("프로젝트명", { exact: true }),
    ).toHaveValue("Private B2B project");
    await editorPage
      .getByRole("button", { name: "프로젝트 만들기", exact: true })
      .click();
    await expect(
      editorPage.getByRole("heading", {
        name: "Private B2B project",
        exact: true,
      }),
    ).toBeVisible();
    const projectId = editorPage.url().split("/").at(-1)!;
    const list = (
      await (await request.get(endpoint, { headers: editor.headers })).json()
    ).data;
    expect(list.projects).toHaveLength(1);
    await page.goto(`${base}/projects`);
    await expect(
      page.getByText("참여한 프로젝트가 없습니다.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByText("Private B2B project", { exact: true }),
    ).toHaveCount(0);
    await page.goto(`${base}/projects/${projectId}`);
    await expect(page.locator("main [role=alert]")).toContainText(
      "접근 권한이 없습니다",
    );
    await editorPage.getByRole("link", { name: "멤버", exact: true }).click();
    await editorPage
      .getByLabel("초대 이메일", { exact: true })
      .fill(owner.email);
    await editorPage
      .getByLabel("참여 구분", { exact: true })
      .selectOption("internal");
    await editorPage
      .getByRole("button", { name: "초대 보내기", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const mailbox = await (
            await request.get(`${api}/__test/mail`)
          ).json();
          return mailbox.findLast(
            (m: { to: string; inviteUrl?: string }) =>
              m.to === owner.email &&
              m.inviteUrl?.includes("/b2b-invitations/"),
          )?.inviteUrl;
        },
        { timeout: 20000 },
      )
      .toBeTruthy();
    const mailbox = await (await request.get(`${api}/__test/mail`)).json();
    const offer = mailbox.findLast(
      (m: { to: string; inviteUrl?: string }) =>
        m.to === owner.email && m.inviteUrl?.includes("/b2b-invitations/"),
    );
    await page.goto(offer.inviteUrl);
    await page.getByRole("button", { name: "초대 수락", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Private B2B project", exact: true }),
    ).toBeVisible();
    await editorPage.reload();
    await expect(
      editorPage.locator("main").getByText(owner.email, { exact: true }),
    ).toBeVisible();
    // Figma-like people list (2026-10-08): the row's menu makes a lead.
    await editorPage
      .locator(`[data-person="${owner.email}"]`)
      .getByRole("button", { name: /작업$/ })
      .click();
    await editorPage
      .getByRole("menuitem", { name: "담당자로 지정", exact: true })
      .click();
    // No longer the lead: nobody's role can be changed from this page.
    await expect(editorPage.getByLabel(/ 역할$/)).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Private B2B project", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page
      .getByLabel("작업 개요", { exact: true })
      .fill("Changed after handoff");
    await page.getByRole("button", { name: "변경 저장", exact: true }).click();
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("project-overview.png"),
      fullPage: true,
    });
    fixture({ workspaceId: team.id, action: "remove", userId: editor.id });
    await editorPage.reload();
    await expect(editorPage.locator("main [role=alert]")).toBeVisible();
    await expect(
      editorPage.getByText("Private B2B project", { exact: true }),
    ).toHaveCount(0);
    fixture({ workspaceId: team.id, action: "expire" });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "설정", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toBeVisible();
    fixture({ workspaceId: team.id, action: "recover" });
    await page.reload();
    await expect(page.locator("main [role=alert]")).toBeVisible();
    await expect(
      page.getByText("Changed after handoff", { exact: true }),
    ).toHaveCount(0);
    expect(browserErrors).toEqual([]);
  } finally {
    await editorContext.close();
  }
});

test("B2B external invitation proves mailbox and preserves billing mutation on lost response", async ({
  page,
  request,
  browser,
}) => {
  const owner = await account(request, "b2b-scope-owner");
  const guest = await account(request, "b2b-scope-guest");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: `B2B scope ${suffix()}` },
      })
    ).json()
  ).data.workspace;
  await request.post(`${api}/v2/workspaces/${team.id}/b2b/enroll`, {
    headers: owner.headers,
    data: {
      revision: 0,
      requestKey: crypto.randomUUID(),
      reason: "Scope acceptance fixture",
    },
  });
  fixture({ workspaceId: team.id, action: "activate" });
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const project = (
    await (
      await request.post(`${endpoint}/projects`, {
        headers: owner.headers,
        data: { requestKey: crypto.randomUUID(), name: "External scope only" },
      })
    ).json()
  ).data.project;
  await request.post(`${endpoint}/projects`, {
    headers: owner.headers,
    data: { requestKey: crypto.randomUUID(), name: "Unshared owner project" },
  });
  await signIn(page, owner.email);
  const base = `/dashboard/workspaces/${team.id}`;
  await page.goto(`${base}/projects/${project.id}/people`);
  await page.getByLabel("초대 이메일", { exact: true }).fill(guest.email);
  await page.getByLabel("초대 역할", { exact: true }).selectOption("reviewer");
  await page.getByRole("button", { name: "초대 보내기", exact: true }).click();
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(
      async () => {
        const mailbox = await (await request.get(`${api}/__test/mail`)).json();
        offer = mailbox.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === guest.email && m.inviteUrl?.includes("/b2b-invitations/"),
        );
        return offer?.inviteUrl;
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  // Possession of the link alone does not expose the project to another account.
  await page.goto(offer!.inviteUrl);
  await expect(page.locator("main [role=alert]")).toContainText(
    "초대받은 이메일",
  );
  await expect(
    page.getByRole("heading", { name: team.name, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("External scope only", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/초대 이메일.*\*\*\*/)).toBeVisible();
  const guestContext = await browser.newContext({ locale: "ko-KR" });
  const guestPage = await guestContext.newPage();
  try {
    await signIn(guestPage, guest.email);
    await guestPage.goto(offer!.inviteUrl);
    await expect(
      guestPage.getByText("프로젝트 뷰어", { exact: true }),
    ).toBeVisible();
    await expect(
      guestPage.getByText("허용되지 않음", { exact: true }),
    ).toBeVisible();
    await guestPage
      .getByRole("button", { name: "초대 수락", exact: true })
      .click();
    await expect(
      guestPage.getByRole("heading", {
        name: "External scope only",
        exact: true,
      }),
    ).toBeVisible();
    await guestPage.goto(`${base}/projects`);
    await expect(
      guestPage.getByText("Unshared owner project", { exact: true }),
    ).toHaveCount(0);
    await guestPage.goto(`${base}/members`);
    await expect(guestPage.locator("main [role=alert]")).toBeVisible();
    await expect(guestPage.getByText(owner.email, { exact: true })).toHaveCount(
      0,
    );
    await page.goto(`${base}/members`);
    // Figma-like people list (2026-10-08): the row's menu holds the rest.
    const guestRow = page.locator(`[data-person="${guest.email}"]`);
    await expect(guestRow.getByText("결제 권한", { exact: true })).toHaveCount(0);
    let lost = true;
    await page.route(`${endpoint}/members/${guest.id}`, async (route) => {
      if (lost) {
        lost = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await guestRow.getByRole("button", { name: /작업$/ }).click();
    await page
      .getByRole("menuitem", { name: "결제 권한 주기", exact: true })
      .click();
    // The answer was lost, but the change landed: the reread shows it.
    await expect(page.locator("main [role=alert]")).toContainText(
      "요청을 완료하지 못했습니다",
    );
    await expect(guestRow.getByText("결제 권한", { exact: true })).toBeVisible();
    const status = (
      await (
        await request.get(`${endpoint}/status`, { headers: guest.headers })
      ).json()
    ).data;
    expect(status.member.kind).toBe("external");
    expect(status.allowedActions.billing).toBe(true);
    expect(status.allowedActions.manage).toBe(false);
    const guestRevision = async () =>
      (
        await (
          await request.get(`${endpoint}/members`, { headers: owner.headers })
        ).json()
      ).data.people.find((p: { userId: string }) => p.userId === guest.id)
        .revision as number;
    expect(await guestRevision()).toBe(1);
    // Suspension left the people table (2026-10-08); the server keeps it.
    expect(
      (
        await request.post(`${endpoint}/members/${guest.id}/action`, {
          headers: owner.headers,
          data: {
            requestKey: crypto.randomUUID(),
            revision: await guestRevision(),
            action: "suspend",
            reason: "Immediately suspend external access",
          },
        })
      ).status(),
    ).toBe(201);
    await page.reload();
    await expect(guestRow.getByText("정지됨", { exact: true })).toBeVisible();
    await guestPage.goto(`${base}/projects/${project.id}`);
    await expect(guestPage.locator("main [role=alert]")).toBeVisible();
    await expect(
      guestPage.getByRole("heading", {
        name: "External scope only",
        exact: true,
      }),
    ).toHaveCount(0);
    await guestRow.getByRole("button", { name: /작업$/ }).click();
    await page.getByRole("menuitem", { name: "다시 활성화", exact: true }).click();
    await expect(guestRow.getByText("정지됨", { exact: true })).toHaveCount(0);
    // Reactivation does not bring billing back.
    await expect(guestRow.getByText("결제 권한", { exact: true })).toHaveCount(0);
    await guestPage.goto(`${base}/projects/${project.id}`);
    await expect(guestPage.locator("main [role=alert]")).toContainText(
      "접근 권한이 없습니다",
    );
    // Settings and billing are for owners and admins; a guest leaves from home.
    for (const path of ["settings", "plan"]) {
      await guestPage.goto(`${base}/${path}`);
      await expect(guestPage.getByTestId("access-denied")).toContainText(
        "권한이 없습니다",
      );
    }
    await guestPage.goto(base);
    await guestPage.getByRole("button", { name: "팀 나가기", exact: true }).click();
    await guestPage
      .getByRole("button", { name: "팀 탈퇴 확인", exact: true })
      .click();
    await expect(guestPage).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
  } finally {
    await guestContext.close();
  }
});

test("B2B owner restores vacant lead without gaining private project content", async ({
  page,
  request,
}) => {
  const owner = await account(request, "b2b-recover-owner");
  const lead = await account(request, "b2b-recover-lead");
  const successor = await account(request, "b2b-recover-successor");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: `B2B recovery ${suffix()}` },
      })
    ).json()
  ).data.workspace;
  await request.post(`${api}/v2/workspaces/${team.id}/b2b/enroll`, {
    headers: owner.headers,
    data: {
      requestKey: crypto.randomUUID(),
      revision: 0,
      reason: "Recovery fixture",
    },
  });
  fixture({ workspaceId: team.id, action: "activate" });
  fixture({ workspaceId: team.id, action: "join", userId: lead.id });
  fixture({ workspaceId: team.id, action: "join", userId: successor.id });
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const project = (
    await (
      await request.post(`${endpoint}/projects`, {
        headers: lead.headers,
        data: {
          requestKey: crypto.randomUUID(),
          name: "Private vacancy content",
          brief: "Owner must never see this",
          visibility: "private",
        },
      })
    ).json()
  ).data.project;
  await request.post(`${endpoint}/invitations`, {
    headers: lead.headers,
    data: {
      requestKey: crypto.randomUUID(),
      email: successor.email,
      kind: "internal",
      teamRole: "editor",
      projectId: project.id,
      projectRole: "producer",
    },
  });
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(
      async () => {
        const mailbox = await (await request.get(`${api}/__test/mail`)).json();
        offer = mailbox.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === successor.email &&
            m.inviteUrl?.includes("/b2b-invitations/"),
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
        headers: successor.headers,
      })
    ).status(),
  ).toBe(201);
  await signIn(page, owner.email);
  const base = `/dashboard/workspaces/${team.id}`;
  await page.goto(`${base}/members`);
  // Repairs fold at the bottom of the people page (2026-10-08).
  await page.getByText("담당자 복구", { exact: true }).click();
  await page
    .getByLabel("복구할 프로젝트 주소", { exact: true })
    .fill(`http://localhost:3001${base}/projects/${project.id}`);
  await page
    .getByRole("button", { name: "담당자 공백 확인", exact: true })
    .click();
  await expect(page.locator("main [role=alert]")).toContainText(
    "현재 담당자가 유효한 프로젝트",
  );
  // Suspension left the people table (2026-10-08); the server keeps it.
  const leadRevision = (
    await (
      await request.get(`${endpoint}/members`, { headers: owner.headers })
    ).json()
  ).data.people.find((p: { userId: string }) => p.userId === lead.id).revision;
  expect(
    (
      await request.post(`${endpoint}/members/${lead.id}/action`, {
        headers: owner.headers,
        data: {
          requestKey: crypto.randomUUID(),
          revision: leadRevision,
          action: "suspend",
          reason: "Immediate revoke before handover",
        },
      })
    ).status(),
  ).toBe(201);
  await page
    .getByRole("button", { name: "담당자 공백 확인", exact: true })
    .click();
  await page
    .getByLabel("수락한 내부 후임", { exact: true })
    .selectOption(successor.id);
  await page
    .getByLabel("담당자 복구 사유", { exact: true })
    .fill("Hand over after urgent suspension");
  await page
    .getByRole("button", { name: "후임 지정 확인", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "후임을 지정했습니다" }),
  ).toBeVisible();
  await expect(
    page.getByText("Private vacancy content", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Owner must never see this", { exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await request.get(`${endpoint}/projects/${project.id}`, {
        headers: owner.headers,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await (
        await request.get(`${endpoint}/projects/${project.id}`, {
          headers: successor.headers,
        })
      ).json()
    ).data.project.role,
  ).toBe("lead");
  expect(
    (
      await request.get(`${endpoint}/projects/${project.id}`, {
        headers: lead.headers,
      })
    ).status(),
  ).toBe(404);
});

test("B2B ownership uses consent and verification, retries lost responses and revokes former billing", async ({
  page,
  request,
  browser,
}) => {
  const owner = await account(request, "b2b-transfer-owner");
  const successor = await account(request, "b2b-transfer-successor");
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: `B2B ownership ${suffix()}` },
      })
    ).json()
  ).data.workspace;
  await request.post(`${api}/v2/workspaces/${team.id}/b2b/enroll`, {
    headers: owner.headers,
    data: {
      requestKey: crypto.randomUUID(),
      revision: 0,
      reason: "Ownership fixture",
    },
  });
  fixture({ workspaceId: team.id, action: "activate" });
  const endpoint = `${api}/v2/workspaces/${team.id}/b2b`;
  const before = (
    await (
      await request.get(`${endpoint}/status`, { headers: owner.headers })
    ).json()
  ).data;
  await request.post(`${endpoint}/invitations`, {
    headers: owner.headers,
    data: {
      requestKey: crypto.randomUUID(),
      email: successor.email,
      kind: "internal",
      teamRole: "reviewer",
    },
  });
  let offer: { inviteUrl: string } | undefined;
  await expect
    .poll(
      async () => {
        const mailbox = await (await request.get(`${api}/__test/mail`)).json();
        offer = mailbox.findLast(
          (m: { to: string; inviteUrl?: string }) =>
            m.to === successor.email &&
            m.inviteUrl?.includes("/b2b-invitations/"),
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
        headers: successor.headers,
      })
    ).status(),
  ).toBe(201);
  const base = `/dashboard/workspaces/${team.id}`;
  await signIn(page, owner.email);
  await page.goto(`${base}/settings`);
  await page
    .getByLabel("내부 소유권 후임", { exact: true })
    .selectOption(successor.id);
  await page
    .getByRole("button", { name: "소유권 이전 본인 확인", exact: true })
    .click();
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  let lost = true;
  await page.route(`${endpoint}/ownership`, async (route) => {
    if (lost) {
      lost = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "본인 확인 후 이전 요청", exact: true })
    .click();
  await expect(
    page.getByLabel("내부 소유권 후임", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "본인 확인 다시 시작", exact: true })
    .click();
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "본인 확인 후 이전 요청", exact: true })
    .click();
  await expect(
    page.getByText("소유권 이전 요청의 수락을 기다리고 있습니다.", {
      exact: true,
    }),
  ).toBeVisible();
  const pending = (
    await (
      await request.get(`${api}/v2/workspaces/${team.id}`, {
        headers: owner.headers,
      })
    ).json()
  ).data.pendingTransfer;
  const successorContext = await browser.newContext({ locale: "ko-KR" });
  const successorPage = await successorContext.newPage();
  try {
    await signIn(successorPage, successor.email);
    // A reviewer has no settings page; the offer waits on the team home.
    await successorPage.goto(base);
    await successorPage
      .getByRole("button", { name: "소유권 수락 본인 확인", exact: true })
      .click();
    await successorPage
      .getByLabel("현재 비밀번호", { exact: true })
      .fill(password);
    let lostAccept = true;
    await successorPage.route(
      `${endpoint}/ownership/${pending.id}/accept`,
      async (route) => {
        if (lostAccept) {
          lostAccept = false;
          const applied = await route.fetch();
          expect(applied.status(), JSON.stringify(await applied.json())).toBe(
            201,
          );
          await route.abort();
        } else await route.continue();
      },
    );
    await successorPage
      .getByRole("button", { name: "본인 확인 후 소유권 수락", exact: true })
      .click();
    await expect(
      successorPage.getByRole("button", {
        name: "본인 확인 다시 시작",
        exact: true,
      }),
    ).toBeVisible();
    // Refresh the completed server state while the lost response is unresolved.
    await successorPage.evaluate(() =>
      window.dispatchEvent(new Event("workspaces:changed")),
    );
    await expect(
      successorPage.getByLabel("내부 소유권 후임", { exact: true }),
    ).toBeVisible();
    await successorPage
      .getByRole("button", { name: "본인 확인 다시 시작", exact: true })
      .click();
    await successorPage
      .getByLabel("현재 비밀번호", { exact: true })
      .fill(password);
    await successorPage
      .getByRole("button", { name: "본인 확인 후 소유권 수락", exact: true })
      .click();
    await expect(
      successorPage
        .getByRole("status")
        .filter({ hasText: "소유권 이전 상태를 업데이트했습니다" }),
    ).toBeVisible();
    const currentOwner = (
      await (
        await request.get(`${endpoint}/status`, { headers: successor.headers })
      ).json()
    ).data;
    const previousOwner = (
      await (
        await request.get(`${endpoint}/status`, { headers: owner.headers })
      ).json()
    ).data;
    expect(currentOwner.allowedActions.billing).toBe(true);
    expect(previousOwner.allowedActions.billing).toBe(false);
    expect(currentOwner.team.revision).toBe(2);
    expect(currentOwner.team.periodEndsAt).toBe(before.team.periodEndsAt);
    await page.goto(`${base}/settings`);
    await page.getByRole("button", { name: "팀 나가기", exact: true }).click();
    await page
      .getByRole("button", { name: "팀 탈퇴 확인", exact: true })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/workspaces(?:$|\?)/);
  } finally {
    await successorContext.close();
  }
});
