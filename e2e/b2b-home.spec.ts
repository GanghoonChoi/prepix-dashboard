import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  api,
  account,
  fixture,
  invite,
  open,
  json,
} from "./b2b-review-helpers";
import type { TeamHome } from "../lib/api/generated/b2b";

test("F03 live home: preparing, own periods/projects/source transfer, exact destinations, external authority and recovery at 390px", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(240000);
  const owner = await account(request, "home-owner"),
    lead = await account(request, "home-other-lead"),
    external = await account(request, "home-client");
  const team = (
    await json(
      request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "팀 홈 실제 인수", requestKey: randomUUID() },
      }),
    )
  ).workspace.id as string;
  const endpoint = `${api}/v2/workspaces/${team}/b2b`,
    base = `/dashboard/workspaces/${team}`;
  const O = await open(browser, owner, base);
  let E: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await expect(
      O.page.getByText("첫 구매가 반영되면 이용기간이 시작됩니다."),
    ).toBeVisible();
    fixture("b2b-paid-test-fixture.cjs", {
      workspaceId: team,
      action: "purchase",
      target: "initial",
    });
    const licences = (await json(
      request.get(`${endpoint}/licences`, { headers: owner.headers }),
    )) as { periods: { id: string; state: string }[] };
    const period = licences.periods.find((p) => p.state === "active")!;
    expect(period).toBeTruthy();
    expect(
      (
        await request.post(`${endpoint}/licences/assignments`, {
          headers: owner.headers,
          data: {
            requestKey: randomUUID(),
            periodId: period.id,
            userId: owner.id,
          },
        })
      ).status(),
    ).toBe(201);
    fixture("b2b-paid-test-fixture.cjs", {
      workspaceId: team,
      action: "purchase",
      target: "next",
      sourcePeriodId: period.id,
    });
    const own = (
      await json(
        request.post(`${endpoint}/projects`, {
          headers: owner.headers,
          data: { requestKey: randomUUID(), name: "홈에서 여는 내 프로젝트" },
        }),
      )
    ).project.id as string;
    fixture("b2b-test-fixture.cjs", {
      workspaceId: team,
      action: "join",
      userId: lead.id,
    });
    const privateProject = (
      await json(
        request.post(`${endpoint}/projects`, {
          headers: lead.headers,
          data: {
            requestKey: randomUUID(),
            name: "홈에서 숨겨야 할 다른 프로젝트",
            visibility: "private",
          },
        }),
      )
    ).project.id as string;
    await invite(request, owner, team, own, external, "external", "reviewer");
    const source = await request.post(`${endpoint}/projects/${own}/uploads`, {
      headers: owner.headers,
      data: {
        requestKey: randomUUID(),
        name: "내 원본 전송 준비.wav",
        kind: "original",
        size: 16044,
        sha256: "a".repeat(64),
        scope: "uploader_and_steward",
      },
    });
    expect(source.status(), await source.text()).toBe(201);
    await O.page.reload();
    const periods = O.page.getByRole("region", { name: "내 좌석" });
    await expect(
      periods.getByText("현재 이용기간", { exact: true }),
    ).toBeVisible();
    await expect(
      periods.getByText("다음 기간 예정", { exact: true }),
    ).toBeVisible();
    await expect(
      periods.getByText("편집 좌석 있음", { exact: true }),
    ).toBeVisible();
    // Team AI is the app's, on the person's seat: the web shows no AI figures.
    await expect(periods.getByText(/AI/)).toHaveCount(0);
    const home = (await json(
      request.get(`${endpoint}/home`, { headers: owner.headers }),
    )) as TeamHome;
    expect(home.currentUserId).toBe(owner.id);
    expect(home.workspaceId).toBe(team);
    expect(home.projects.items.map((p) => p.id)).toEqual([own]);
    expect(home.projects.hasMore).toBe(false);
    expect(home.transfers.items.map((t) => t.name)).toEqual([
      "내 원본 전송 준비.wav",
    ]);
    const projects = O.page.getByRole("region", {
      name: "내 폴더",
      exact: true,
    });
    await expect(
      projects.getByRole("link", { name: /홈에서 여는 내 프로젝트/ }),
    ).toBeVisible();
    await expect(
      O.page.getByText("홈에서 숨겨야 할 다른 프로젝트", { exact: true }),
    ).toHaveCount(0);
    const transfer = O.page.getByRole("link", {
      name: /내 원본 전송 준비.wav/,
    });
    await expect(transfer).toHaveAttribute(
      "href",
      `${base}/projects/${own}/files`,
    );
    await transfer.click();
    await expect(
      O.page.getByRole("heading", { name: "폴더 자료", exact: true }),
    ).toBeVisible();
    await O.page.goto(base);
    // 2026-10-08 cleanup: requests and delivery left the home; review work
    // stays, with its own authoritative queue.
    await expect(
      O.page.getByRole("heading", { name: "내 요청 업무", exact: true }),
    ).toHaveCount(0);
    await expect(
      O.page.getByRole("heading", { name: "검토·승인 업무", exact: true }),
    ).toBeVisible();
    E = await open(browser, external, base);
    await expect(
      E.page
        .getByRole("region", { name: "내 폴더", exact: true })
        .getByText("홈에서 여는 내 프로젝트"),
    ).toBeVisible();
    await expect(
      E.page.getByText("홈에서 숨겨야 할 다른 프로젝트", { exact: true }),
    ).toHaveCount(0);
    await expect(
      E.page.getByText("내 원본 전송 준비.wav", { exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await request.get(`${endpoint}/projects/${privateProject}`, {
          headers: external.headers,
        })
      ).status(),
    ).toBe(404);
    await O.page.setViewportSize({ width: 390, height: 844 });
    await O.page.reload();
    await expect(
      periods.getByText("편집 좌석 있음", { exact: true }),
    ).toBeVisible();
    expect(
      await O.page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await testInfo.attach("F03 mobile home", {
      body: await O.page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "recover" });
    await O.page.reload();
    await expect(
      O.page.getByText("팀 자료 접근이 중지되었습니다.", { exact: false }),
    ).toBeVisible();
    await expect(
      O.page.getByRole("region", { name: "내 폴더", exact: true }),
    ).toHaveCount(0);
    await expect(
      O.page.getByRole("region", { name: "내 원본 전송", exact: true }),
    ).toHaveCount(0);
    await expect(
      O.page.getByRole("link", { name: "이용 상태", exact: true }),
    ).toBeVisible();
    const hidden = (await json(
      request.get(`${endpoint}/home`, { headers: owner.headers }),
    )) as TeamHome;
    expect(hidden.currentState).toBe("recovery");
    for (const list of [
      hidden.projects,
      hidden.transfers,
      hidden.deliveries,
    ])
      expect(list).toEqual({ items: [], hasMore: false });
    expect(O.errors).toEqual([]);
    expect(E.errors).toEqual([]);
  } finally {
    await O.close();
    await E?.close();
  }
});
