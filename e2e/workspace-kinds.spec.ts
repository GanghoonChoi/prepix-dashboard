import { test, expect, type Page } from "@playwright/test";

/**
 * Personal and team workspaces are different objects (spec D13), and each test
 * below fails if one of the six guardrails is reverted:
 *
 *  1. the distinction is visible      → "a personal space reads as yours…"
 *  2. no team chrome in personal      → "…and offers no invite affordance"
 *  3. which space, at the action      → "the space is named where files land"
 *  4. seats as separate numbers       → "seat figures move independently"
 *  5. role explained where assigned   → "the capability grid is at both…"
 *  6. one confirmation gate           → "cancelling an upload asks the same…"
 *
 * Runs against scripts/workspaces-preview.cjs in prepix-backend (dedicated
 * local DB, captured mail). Uploads additionally need TEAM_TEST_STORAGE=true.
 */
const api = "http://127.0.0.1:3308";
const password = "LocalPreview123";

async function register(request: Page["request"], email: string) {
  expect(
    (
      await request.post(`${api}/v2/auth/register`, {
        data: { email, password, username: email.split("@")[0] },
      })
    ).status()
  ).toBe(201);
}

async function login(page: Page, email: string) {
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "계속하기", exact: true }).click();
}

test("a personal space reads as yours, offers no invite affordance anywhere, and a team is a visibly different entry", async ({
  page,
}, testInfo) => {
  const suffix = Date.now();
  const email = `kinds-${suffix}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(page.request, email);

  await page.goto("/dashboard/workspaces?locale=ko");
  await login(page, email);
  await expect(
    page.getByRole("heading", { name: "워크스페이스", level: 1 })
  ).toBeVisible();

  // ---- 1. the distinction is on screen, in both lists -------------------
  const main = page.locator("main");
  const personalCard = main.locator('[data-space="personal"]');
  await expect(personalCard).toHaveCount(1);
  await expect(personalCard).toContainText("개인 공간");
  // Never the server's own name for it. "<account>의 워크스페이스" sitting in a
  // list next to "Studio team" is exactly the row that reads like one more
  // team, which is what D13 §2.3 says causes the wrong-space mistake.
  await expect(personalCard).not.toContainText("의 워크스페이스");
  await expect(personalCard).not.toContainText(email.split("@")[0]);
  await expect(main.locator('[data-space="team"]')).toHaveCount(0);
  // A one-workspace account is not an empty team list.
  await expect(main.getByText(/다른 사람과 함께 일할 때 팀을 만드세요/)).toBeVisible();
  // The sidebar switcher agrees, and marks the same kind. (The layout renders
  // a desktop and a mobile <aside>, so this takes the visible one.)
  await expect(
    page.locator('aside [data-space="personal"]').first()
  ).toBeVisible();
  await expect(page.locator('aside [data-space="team"]')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("personal-only.png"),
    fullPage: true,
  });

  // ---- 2. no team chrome in the personal space --------------------------
  await personalCard.click();
  await expect(
    page.getByRole("heading", { name: "내 개인 공간", level: 1 })
  ).toBeVisible();
  const personalUrl = page.url();
  for (const name of ["멤버", "활동 기록"])
    await expect(
      page.getByRole("link", { name, exact: true })
    ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초대 보내기" })).toHaveCount(0);
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-seats="split"]')).toHaveCount(0);
  // Absent, not disabled: nothing offers to invite even in a refused state.
  await expect(page.locator("button:disabled")).toHaveCount(0);

  // The tab is gone; the address bar is the other door, and it is shut too.
  await page.goto(`${personalUrl}/members`);
  await expect(page.getByText(/개인 공간에는 멤버도, 역할도/)).toBeVisible();
  await expect(page.getByLabel("이메일 주소", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "초대 보내기" })).toHaveCount(0);

  // No ownership transfer, no leaving, no delete.
  await page.goto(`${personalUrl}/settings`);
  await expect(page.getByRole("heading", { name: "소유권" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "워크스페이스 탈퇴" })
  ).toHaveCount(0);
  // …and it still says which space you are looking at. The badge is a pill
  // now rather than a band of prose, so what it must carry is the NAME — the
  // "현재 위치" label went with the sentence.
  await expect(main.locator('[data-space="personal"]').first()).toContainText(
    "개인 공간"
  );

  // Seats belong to a team, so the personal plan page shows none.
  await page.goto(`${personalUrl}/plan`);
  await expect(page.locator('[data-seats="split"]')).toHaveCount(0);

  // ---- 1b. creating a team adds a second, visibly different entry --------
  await page.goto("/dashboard/workspaces/new?locale=ko");
  const teamName = `Kinds team ${suffix}`;
  await page.getByLabel("워크스페이스 이름", { exact: true }).fill(teamName);
  await page.getByRole("button", { name: "워크스페이스 만들기" }).click();
  await page.goto("/dashboard/workspaces?locale=ko");
  await expect(main.locator('[data-space="personal"]')).toHaveCount(1);
  await expect(main.locator('[data-space="team"]')).toHaveCount(1);
  await expect(main.locator('[data-space="team"]')).toContainText(teamName);
  await expect(main.locator('[data-space="personal"]')).toContainText(
    "개인 공간"
  );
  // The two rows do not share an icon: personal is a person, a team a building.
  const shape = (selector: string) =>
    main.locator(`${selector} svg`).first().getAttribute("class");
  expect(await shape('[data-space="personal"]')).not.toEqual(
    await shape('[data-space="team"]')
  );
  await page.screenshot({
    path: testInfo.outputPath("personal-and-team.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("seat figures stay separate numbers and move independently, and the capability grid sits at both places a role is assigned", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now();
  const email = `seats-${suffix}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(request, email);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email, password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: `Seat math ${suffix}` },
      })
    ).json()
  ).data.workspace;
  expect(team.type).toBe("team");

  await page.goto(`/dashboard/workspaces/${team.id}/members?locale=ko`);
  await login(page, email);

  // ---- 4. five figures, never one total ---------------------------------
  const seats = page.locator('[data-seats="split"]');
  await expect(seats).toBeVisible();
  const figure = (name: string) => seats.locator(`[data-seat="${name}"]`);
  await expect(figure("active")).toHaveText("1");
  await expect(figure("invited")).toHaveText("0");
  await expect(figure("suspended")).toHaveText("0");
  await expect(figure("reviewers")).toHaveText("0");
  // The owner holds one of the ten; `remaining` is not `limit`, and it is not
  // `limit - active` either once an invitation exists (asserted below).
  await expect(figure("remaining")).toHaveText("9");

  // ---- 5. the role grid is at the point of assignment --------------------
  await page
    .locator("form")
    .getByRole("button", { name: "역할별 권한" })
    .click();
  const guide = page.getByRole("dialog");
  const grid = guide.getByRole("table");
  await expect(
    grid.getByRole("columnheader", { name: "소유자", exact: true })
  ).toBeVisible();
  // Only rules the backend actually enforces are allowed on this table; the
  // rows that merely sounded plausible are gone.
  await expect(
    grid.getByRole("rowheader", { name: /소유권 이전 · 관리자 지정/ })
  ).toBeVisible();
  await expect(
    grid.getByRole("rowheader", { name: /팀 삭제/ })
  ).toHaveCount(0);
  // The rule the server enforces silently and no screen used to state.
  await expect(
    guide.getByText(/관리자는 누구도 소유자로 지정할 수 없습니다/)
  ).toBeVisible();
  await guide.getByRole("button", { name: "닫기" }).click();
  // The invite form names the space people are about to be let into.
  await expect(
    page.locator('form [data-space="team"]')
  ).toContainText(`Seat math ${suffix}`);
  await page.screenshot({
    path: testInfo.outputPath("seats-and-roles.png"),
    fullPage: true,
  });

  // ---- 4b. an unaccepted invitation holds a seat, visibly ---------------
  // This is the Dropbox trap: with one total, sending two invitations and
  // gaining no members would read as "nothing changed". Here `invited` and
  // `remaining` move while `active` does not.
  await page
    .getByLabel("이메일 주소", { exact: true })
    .fill(`s1-${suffix}@example.test, s2-${suffix}@example.test`);
  await page.getByRole("button", { name: "초대 보내기", exact: true }).click();
  await expect(figure("invited")).toHaveText("2");
  await expect(figure("remaining")).toHaveText("7");
  await expect(figure("active")).toHaveText("1");

  // ---- 5b. and again where an existing member's role is changed ---------
  const memberEmail = `member-${suffix}@example.test`;
  await register(request, memberEmail);
  const invite = (
    await (
      await request.post(`${api}/v2/workspaces/${team.id}/invitations`, {
        headers,
        data: { emails: [memberEmail], role: "editor" },
      })
    ).json()
  ).data.results[0];
  expect(invite.status).not.toBe("invalid_email");
  const mail = (await (await request.get(`${api}/__test/mail`)).json()) as {
    to: string;
    inviteUrl: string;
  }[];
  const token = mail
    .findLast((message) => message.to === memberEmail)!
    .inviteUrl.split("/")
    .at(-1)!;
  const joiner = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email: memberEmail, password },
      })
    ).json()
  ).data;
  expect(
    (
      await request.post(
        `${api}/v2/workspaces/invitations/${token}/accept`,
        { headers: { Authorization: `Bearer ${joiner.accessToken}` } }
      )
    ).status()
  ).toBe(201);

  await page.reload();
  await expect(figure("active")).toHaveText("2");
  await page
    .getByRole("row")
    .filter({ hasText: memberEmail })
    .getByRole("button", { name: "작업" })
    .click();
  await page.getByRole("menuitem", { name: "검토자로 변경" }).click();
  const change = page.getByRole("dialog");
  await expect(change).toContainText(memberEmail);
  await expect(
    change.getByRole("rowheader", { name: /소유권 이전 · 관리자 지정/ })
  ).toBeVisible();
  // Nothing has happened yet: a role change asks before it acts.
  await expect(figure("reviewers")).toHaveText("0");
  await change.getByRole("button", { name: "변경", exact: true }).click();
  await expect(figure("reviewers")).toHaveText("1");
  expect(errors).toEqual([]);
});

test("the space is named where files land, and cancelling an upload asks the same question from either door", async ({
  page,
  request,
}, testInfo) => {
  const suffix = Date.now();
  const email = `upload-${suffix}@example.test`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await register(request, email);
  const session = (
    await (
      await request.post(`${api}/v2/auth/email/login`, {
        data: { email, password },
      })
    ).json()
  ).data;
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const cloud = (
    await (
      await request.get(`${api}/v2/workspaces/capabilities/cloud`, { headers })
    ).json()
  ).data;
  test.skip(
    !cloud?.enabled || !cloud?.uploadsEnabled,
    "team storage is not enabled in this environment"
  );
  const team = (
    await (
      await request.post(`${api}/v2/workspaces`, {
        headers,
        data: { name: `Landing ${suffix}` },
      })
    ).json()
  ).data.workspace;

  // D14 removes the cloud "team project" — a workspace is one team video
  // archive, so there is no project to create first. The archive is the
  // upload surface itself.
  await page.goto(`/dashboard/workspaces/${team.id}/media?locale=ko`);
  await login(page, email);

  // ---- 3. the archive names the space it uploads into --------------------
  const badge = page.locator('main [data-space="team"]').first();
  await expect(badge).toContainText(`Landing ${suffix}`);
  await expect(badge).toHaveAttribute(
    "title",
    "여기서 하는 일은 이 팀에게 보입니다.",
  );
  await page.screenshot({
    path: testInfo.outputPath("upload-space-named.png"),
    fullPage: true,
  });

  // ---- 6. one confirmation gate, whichever door -------------------------
  // Break the part transfer so the row lands in the queue's recovery state
  // WITH a server-side asset behind it. That row's cancel button used to call
  // the destructive endpoint immediately while the asset row's cancel asked
  // first — the Linear shape: a gate on the manual flow, none on the path an
  // error takes you down.
  await page.route("**/uploads/*/part", (route) => route.abort());
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      { name: "clip.mov", mimeType: "video/quicktime", buffer: Buffer.alloc(4096, 3) },
    ]);
  const panel = page.getByRole("region", { name: "전송 패널" });
  const row = panel.getByRole("listitem").filter({ hasText: "clip.mov" });
  await expect(row).toContainText("실패", { timeout: 30_000 });
  await row.getByRole("button", { name: "취소", exact: true }).click();
  const dialog = page.getByRole("alertdialog", { name: "작업 확인" });
  await expect(dialog).toContainText("이 업로드를 취소할까요?");
  await expect(dialog).toContainText("용량 예약을 해제합니다");
  // Backing out leaves the transfer exactly where it was.
  await dialog.getByRole("button", { name: "돌아가기", exact: true }).click();
  await expect(row).toContainText("실패");
  await row.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "작업 확인" })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await expect(row).toContainText("취소됨");
  await page.unroute("**/uploads/*/part");
  expect(errors).toEqual([]);
});
