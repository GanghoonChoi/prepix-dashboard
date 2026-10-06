import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, media, account, fixture, invite, open, upload, json, shot } from "./b2b-review-helpers";

// V (2026-10-06): a registered result opens for review by itself once its
// review copy is ready; a new version of the same asset opens the next round.
// The lead's manual publish is only an early fallback (allowedActions.publish).
test("F12/V: registered results publish to review automatically; a new version stacks a round; a failed copy stays unpublished", async ({ browser, request }) => {
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
  await P.page.waitForURL((url) => url.pathname === `${base}/files`);
  const L = await open(browser, lead, `${base}/publications`);
  await L.page.waitForURL((url) => url.pathname === `${base}/publications`);
  const uploads = new Map<string, string>();
  P.page.on("response", async (response) => {
    if (response.url() === `${root}/uploads` && response.request().method() === "POST" && response.status() === 201)
      uploads.set(response.request().postDataJSON().name, (await response.json()).data.upload.id);
  });
  const register = async (name: string, title: string, newVersionOf?: string) => {
    await P.page.goto(`${base}/files`);
    await P.page.getByRole("combobox", { name: "자료 종류", exact: true }).selectOption("output");
    await upload(P.page, name, newVersionOf);
    await expect.poll(async () => (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions.find((v: { name: string }) => v.name === name)?.id, { timeout: 90_000 }).toBeTruthy();
    const version = (await json(request.get(`${root}/files`, { headers: producer.headers }))).versions.find((v: { name: string }) => v.name === name);
    await expect.poll(() => uploads.get(name)).toBeTruthy();
    const list = await json(request.get(`${root}/publications`, { headers: producer.headers }));
    const body = { requestKey: randomUUID(), participationId: list.currentParticipationId, originWorkId: "local-work-one", originResultId: `render-${name}`, originRequestId: null, basisRevision: list.projectRevision, uploadId: uploads.get(name), title, generatedAt: new Date().toISOString(), sha256: version.sha256, size: version.size };
    const response = await request.post(`${root}/publications`, { headers: producer.headers, data: body });
    expect(response.status(), await response.text()).toBe(201);
    const result = (await response.json()).data;
    expect((await json(request.post(`${root}/publications`, { headers: producer.headers, data: body }))).publicationId).toBe(result.publicationId);
    return { version, result };
  };
  try {
    const first = await register("cut-v1.mp4", "첫 결과");
    // Publishing stays a lead action; the producer's manual publish is refused.
    expect((await request.post(`${root}/publications/${first.result.publicationId}/publish`, { headers: producer.headers, data: { requestKey: randomUUID(), revision: first.result.projectRevision } })).status()).toBe(403);
    await expect.poll(async () => (await json(request.get(`${root}/publications/${first.result.publicationId}`, { headers: lead.headers }))).publication.state, { timeout: 120_000 }).toBe("published");
    const reviews = await json(request.get(`${root}/reviews`, { headers: lead.headers }));
    expect(reviews.reviews).toHaveLength(1);
    const reviewId = reviews.reviews[0].id;
    const review = await json(request.get(`${root}/reviews/${reviewId}`, { headers: client.headers }));
    expect([review.review.audienceScope, review.review.round, review.review.versionId, review.audience, review.approval]).toEqual(["project", 1, first.version.id, [], "no_approver"]);
    // Everyone on the project reads it, including the uploader and the external reviewer.
    expect((await request.get(`${root}/reviews/${reviewId}`, { headers: producer.headers })).status()).toBe(200);
    await L.page.reload();
    await expect(L.page.getByTestId("latest-result")).toHaveText(first.version.id);
    await expect(L.page.getByTestId("current-review")).toHaveText(first.version.id);
    await expect(L.page.getByTestId("final-approved")).toHaveText("없음");
    await expect(L.page.getByRole("link", { name: "공개한 검토 보기", exact: true })).toHaveAttribute("href", `${base}/reviews/${reviewId}`);
    await expect(L.page.getByRole("button", { name: "지금 공개", exact: true })).toHaveCount(0);
    // An approval request on the old round ends when the next version lands.
    const approver = await request.post(`${root}/reviews/${reviewId}/approver`, { headers: lead.headers, data: { requestKey: randomUUID(), revision: review.review.revision, userId: client.id, reason: "" } });
    expect(approver.status(), await approver.text()).toBe(201);
    const comment = await request.post(`${root}/reviews/${reviewId}/comments`, { headers: client.headers, data: { requestKey: randomUUID(), round: 1, versionId: first.version.id, body: "1회차 의견", startMs: 500, endMs: null } });
    expect(comment.status(), await comment.text()).toBe(201);

    const second = await register("cut-v2.mp4", "두 번째 결과", "cut-v1.mp4");
    expect(second.version.assetId).toBe(first.version.assetId);
    await expect.poll(async () => (await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }))).review.round, { timeout: 120_000 }).toBe(2);
    const round2 = await json(request.get(`${root}/reviews/${reviewId}`, { headers: lead.headers }));
    expect([round2.review.versionId, round2.comments.length, round2.approval]).toEqual([second.version.id, 0, "no_approver"]);
    expect((await json(request.get(`${root}/reviews/${reviewId}?round=1`, { headers: lead.headers }))).comments.map((c: { body: string }) => c.body)).toEqual(["1회차 의견"]);
    expect((await json(request.get(`${root}/reviews`, { headers: lead.headers }))).reviews).toHaveLength(1);
    await L.page.reload();
    await expect(L.page.getByTestId("latest-result")).toHaveText(second.version.id);
    await expect(L.page.getByTestId("current-review")).toHaveText(second.version.id);

    // A source whose review copy cannot be made is registered but never published.
    const failed = await register("long-cut.mp4", "긴 결과");
    await expect.poll(async () => (await json(request.get(`${root}/publications/${failed.result.publicationId}`, { headers: lead.headers }))).publication.previewState, { timeout: 120_000 }).toBe("failed");
    await L.page.reload();
    const card = L.page.getByTestId(`publication-${failed.result.publicationId}`);
    await expect(card).toContainText("검토본을 만들지 못해 공개되지 않았습니다");
    await expect(card.getByRole("button", { name: "지금 공개", exact: true })).toHaveCount(0);
    expect((await json(request.get(`${root}/publications/${failed.result.publicationId}`, { headers: lead.headers }))).publication.state).toBe("registered");
    await shot(L.page, "f12-auto-publication");
    await P.page.goto(`${base}/publications`);
    await expect(P.page.getByRole("heading", { name: "등록된 결과", exact: true })).toBeVisible();
    await expect(P.page.getByRole("button", { name: "지금 공개", exact: true })).toHaveCount(0);
    expect((await request.get(`${root}/publications`, { headers: client.headers })).status()).toBe(200);
    expect(L.errors).toEqual([]); expect(P.errors).toEqual([]);
  } finally { await L.close(); await P.close(); }
});
