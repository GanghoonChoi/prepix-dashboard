import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, account, fixture, invite, open, upload, videoReady, json, shot } from "./b2b-review-helpers";

test("F12: registered results stay separate from review and approval; lead plays, selects audience and recovers one publication", async ({ browser, request }) => {
  test.setTimeout(420_000);
  expect(media, "Set B2B_E2E_MEDIA_DIR").toBeTruthy();
  const [owner, lead, producer, client] = await Promise.all(["pub-owner", "pub-lead", "pub-producer", "pub-client"].map((label) => account(request, label)));
  const team = (await json(request.post(`${api}/v2/workspaces`, { headers: owner.headers, data: { name: "결과 공개 인수", requestKey: randomUUID() } }))).workspace.id;
  fixture("b2b-paid-test-fixture.cjs", { workspaceId: team, action: "purchase", target: "initial" });
  for (const user of [lead, producer]) fixture("b2b-test-fixture.cjs", { workspaceId: team, action: "join", userId: user.id });
  const projectId = (await json(request.post(`${api}/v2/workspaces/${team}/b2b/projects`, { headers: lead.headers, data: { requestKey: randomUUID(), name: "독립 결과 버전" } }))).project.id;
  await invite(request, lead, team, projectId, producer, "internal", "producer");
  await invite(request, lead, team, projectId, client, "external", "reviewer");
  const root = `${api}/v2/workspaces/${team}/b2b/projects/${projectId}`, base = `/dashboard/workspaces/${team}/projects/${projectId}`;
  const P = await open(browser, producer, `${base}/files`);
  await P.page.waitForURL(`**${base}/files`);
  const L = await open(browser, lead, `${base}/publications`);
  await L.page.waitForURL(`**${base}/publications`);
  const uploads = new Map<string, string>();
  P.page.on("response", async (response) => {
    if (response.url() === `${root}/uploads` && response.request().method() === "POST" && response.status() === 201) {
      const data = (await response.json()).data;
      uploads.set(response.request().postDataJSON().name, data.upload.id);
    }
  });
  const register = async (name: string, originResultId: string) => {
    await P.page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("output");
    await upload(P.page, name);
    await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions.find((v: { name: string }) => v.name === name)?.id, { timeout: 90_000 }).toBeTruthy();
    const version = (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions.find((v: { name: string }) => v.name === name);
    await expect.poll(() => uploads.get(name)).toBeTruthy();
    expect((await request.post(`${root}/assets/${version.assetId}/permissions`, { headers: producer.headers, data: { requestKey: randomUUID(), revision: 0, userId: lead.id, canDownload: false, canUseForAi: false, reason: "Lead checks this immutable result" } })).status()).toBe(201);
    const list = await json(request.get(`${root}/publications`, { headers: producer.headers }));
    const body = { requestKey: randomUUID(), participationId: list.currentParticipationId, originWorkId: "local-work-one", originResultId, originRequestId: null, basisRevision: list.projectRevision, uploadId: uploads.get(name), title: name === "cut-v1.mp4" ? "첫 결과" : "새 결과", generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size };
    const response = await request.post(`${root}/publications`, { headers: producer.headers, data: body });
    expect(response.status(), await response.text()).toBe(201);
    const result = (await response.json()).data;
    expect((await json(request.post(`${root}/publications`, { headers: producer.headers, data: body }))).publicationId).toBe(result.publicationId);
    expect((await request.post(`${root}/publications`, { headers: producer.headers, data: { ...body, requestKey: randomUUID() } })).status()).toBe(409);
    return { version, result, body };
  };
  const prepare = async (page: Page, publicationId: string) => {
    await page.getByTestId(`publication-${publicationId}`).getByRole("button", { name: "이 결과 공개 준비", exact: true }).click();
    const publish = page.getByRole("button", { name: "이 결과를 검토에 공개", exact: true });
    await expect(publish).toBeDisabled();
    await expect(page.getByLabel("이 결과의 재생을 확인했습니다", { exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "공개 전 재생", exact: true }).click();
    await videoReady(page);
    await page.locator("video").evaluate((video: HTMLVideoElement) => video.play());
    await page.getByLabel("이 결과의 재생을 확인했습니다", { exact: true }).check();
    await page.getByRole("checkbox", { name: "pub-client · 검토자", exact: true }).check();
    await expect(publish).toBeDisabled();
    await page.getByRole("combobox", { name: "승인자 선택", exact: true }).selectOption(client.id);
    await expect(publish).toBeEnabled();
    return publish;
  };
  try {
    const first = await register("cut-v1.mp4", "render-one");
    expect((await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews).toHaveLength(0);
    expect((await request.post(`${root}/publications/${first.result.publicationId}/publish`, { headers: producer.headers, data: { requestKey: randomUUID(), revision: first.result.projectRevision, audienceUserIds: [client.id], approverUserId: client.id } })).status()).toBe(403);
    await expect.poll(async () => (await json(request.get(`${root}/publications`, { headers: lead.headers }))).publications[0].previewState, { timeout: 120_000 }).toBe("ready");
    await L.page.reload();
    await expect(L.page.getByTestId("latest-result")).toHaveText(first.version.id);
    await expect(L.page.getByTestId("current-review")).toHaveText("없음");
    await expect(L.page.getByTestId("final-approved")).toHaveText("없음");
    const publish = await prepare(L.page, first.result.publicationId);
    let sends = 0, lost = false;
    await L.page.route(`${root}/publication-operations/publish/**`, (route) => lost ? route.abort() : route.continue());
    await L.page.route(`${root}/publications/${first.result.publicationId}/publish`, async (route) => {
      sends++; lost = true;
      expect((await route.fetch()).status()).toBe(201);
      await route.abort();
    });
    await publish.click();
    await expect(L.page.getByRole("heading", { name: "결과 확인이 필요한 공개 요청", exact: true })).toBeVisible();
    // A stale in-flight token must not let a logged-out browser learn/clear
    // the old account's stored publication receipt.
    const retainedUser = await L.page.evaluate(() => localStorage.getItem("userInfo"));
    await L.page.evaluate(() => { localStorage.removeItem("userInfo"); window.dispatchEvent(new Event("focus")); });
    await expect(L.page.getByTestId(`publication-${first.result.publicationId}`)).toHaveCount(0);
    expect(await L.page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open("prepix-b2b-publications", 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      try { return await new Promise<number>((resolve, reject) => { const t = db.transaction("operations", "readonly"), r = t.objectStore("operations").count(); t.oncomplete = () => resolve(r.result); t.onerror = () => reject(t.error); }); }
      finally { db.close(); }
    })).toBe(1);
    await L.page.evaluate((value) => localStorage.setItem("userInfo", value!), retainedUser);
    const all = await json(request.get(`${root}/reviews`, { headers: lead.headers }));
    expect(all.reviews).toHaveLength(1);
    const reviewId = all.reviews[0].id;
    lost = false;
    await L.page.unroute(`${root}/publication-operations/publish/**`);
    await L.page.unroute(`${root}/publications/${first.result.publicationId}/publish`);
    await L.page.reload();
    await expect(L.page.getByRole("link", { name: "공개한 검토 보기", exact: true })).toBeVisible();
    await expect(L.page.getByRole("heading", { name: "결과 확인이 필요한 공개 요청", exact: true })).toHaveCount(0);
    expect(sends).toBe(1);
    await expect(L.page.getByTestId("current-review")).toHaveText(first.version.id);
    const review = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
    expect(review.audience.map((u: { userId: string }) => u.userId)).toEqual([client.id]);
    expect((await request.get(`${root}/reviews/${reviewId}`, { headers: producer.headers })).status()).toBe(404);
    expect((await request.post(`${root}/reviews/${reviewId}/decisions`, { headers: client.headers, data: { requestKey: randomUUID(), revision: review.review.revision, round: review.review.round, versionId: first.version.id, decision: "approved", reason: "" } })).status()).toBe(201);
    const second = await register("cut-v2.mp4", "render-two");
    expect(second.result.publicationId).not.toBe(first.result.publicationId);
    expect(second.version.id).not.toBe(first.version.id);
    await expect.poll(async () => (await json(request.get(`${root}/publications/${second.result.publicationId}`, { headers: lead.headers }))).publication.previewState, { timeout: 120_000 }).toBe("ready");
    await L.page.goto(`${base}/publications?publicationId=${second.result.publicationId}`);
    await expect(L.page.getByTestId("latest-result")).toHaveText(second.version.id);
    await expect(L.page.getByTestId("current-review")).toHaveText(first.version.id);
    await expect(L.page.getByTestId("final-approved")).toHaveText(first.version.id);
    await expect(L.page.getByRole("heading", { name: "검토 공개 준비: 새 결과", exact: true })).toBeVisible();
    await expect(L.page.getByRole("button", { name: "이 결과를 검토에 공개", exact: true })).toBeDisabled();
    expect((await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews).toHaveLength(1);
    await shot(L.page, "f12-independent-result-review-approval");
    await P.page.goto(`${base}/publications`);
    await expect(P.page.getByRole("heading", { name: "등록된 결과", exact: true })).toBeVisible();
    await expect(P.page.getByTestId(`publication-${second.result.publicationId}`).getByRole("button", { name: "이 결과 공개 준비", exact: true })).toBeDisabled();
    expect((await json(request.get(`${root}/publications`, { headers: client.headers }))).publications).toHaveLength(0);
    expect(L.errors).toEqual([]); expect(P.errors).toEqual([]);
  } finally { await L.close(); await P.close(); }
});
