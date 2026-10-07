import { test, expect } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { api, account, fixture, open, json } from "./b2b-review-helpers";
import type {
  TeamAiExecution,
  TeamAiQuote,
  TeamAiRoughcutResultDocument,
  TeamAiResultDocument,
  TeamHome,
} from "../lib/api/generated/b2b";
const double = process.env.B2B_E2E_AI_DOUBLE_URL ?? "http://127.0.0.1:3972";
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
test("W20 live whole-job roughcut: two exact videos, consent, original request recovery, ordered preview and exact download; multi transcript/vision remain supported", async ({
  browser,
  request,
}, testInfo) => {
  test.setTimeout(300000);
  const previous = (
    await (await request.get(`${double}/__double/state`)).json()
  ).mode;
  const mode = async (value: object) =>
    expect(
      (await request.post(`${double}/__double/mode`, { data: value })).status(),
    ).toBe(200);
  const owner = await account(request, "web-roughcut-owner");
  const team = (
    await json(
      request.post(`${api}/v2/workspaces`, {
        headers: owner.headers,
        data: { name: "러프컷 실제 웹 인수", requestKey: randomUUID() },
      }),
    )
  ).workspace.id as string;
  const endpoint = `${api}/v2/workspaces/${team}/b2b`;
  fixture("b2b-paid-test-fixture.cjs", {
    workspaceId: team,
    action: "purchase",
    target: "initial",
  });
  const licence = (
    await json(request.get(`${endpoint}/licences`, { headers: owner.headers }))
  ).periods.find((p: { state: string }) => p.state === "active");
  expect(
    (
      await request.post(`${endpoint}/licences/assignments`, {
        headers: owner.headers,
        data: {
          requestKey: randomUUID(),
          periodId: licence.id,
          userId: owner.id,
        },
      })
    ).status(),
  ).toBe(201);
  const project = (
    await json(
      request.post(`${endpoint}/projects`, {
        headers: owner.headers,
        data: { name: "함께 분석할 두 원본", requestKey: randomUUID() },
      }),
    )
  ).project.id as string;
  const root = `${endpoint}/projects/${project}`,
    path = `/dashboard/workspaces/${team}/projects/${project}/ai`;
  const versions: { id: string; name: string; sha256: string }[] = [];
  for (const [n, filename] of ["prepix-roughcut-web-first.mp4", "prepix-roughcut-web-second.mp4"].entries()) {
    const bytes = await readFile(
        resolve(process.env.B2B_E2E_MEDIA_DIR!, filename),
      ),
      name = `정확한 원본 ${n + 1}.mp4`;
    const upload = (
      await json(
        request.post(`${root}/uploads`, {
          headers: owner.headers,
          data: {
            requestKey: randomUUID(),
            name,
            kind: "original",
            size: bytes.length,
            sha256: hash(bytes),
            scope: "uploader_and_steward",
          },
        }),
      )
    ).upload;
    const part = await json(
      request.post(`${root}/uploads/${upload.id}/parts`, {
        headers: owner.headers,
        data: {
          number: 1,
          checksum: createHash("sha256").update(bytes).digest("base64"),
        },
      }),
    );
    expect(
      (
        await fetch(part.url, {
          method: "PUT",
          headers: part.headers,
          body: new Uint8Array(bytes),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request.post(`${root}/uploads/${upload.id}/complete`, {
          headers: owner.headers,
          data: {},
        })
      ).status(),
    ).toBe(201);
    let versionId = "";
    await expect
      .poll(
        async () => {
          const v = await json(
            request.get(`${root}/uploads/${upload.id}`, {
              headers: owner.headers,
            }),
          );
          versionId = v.upload.versionId;
          return v.upload.state;
        },
        { timeout: 60000 },
      )
      .toBe("ready");
    expect(versionId).toBeTruthy();
    versions.push({ id: versionId, name, sha256: hash(bytes) });
  }
  const O = await open(browser, owner, path);
  try {
    await mode({
      roughcut: "ok",
      vision: "ok",
      transcript: "ok",
      completeLimit: null,
      pollsUntilDone: 1,
      durationOffsetMs: 0,
      geminiFinalize: "ok",
      deleteFails: false,
    });
    await O.page
      .getByRole("radio", { name: "러프컷 구성", exact: true })
      .check();
    for (const v of versions)
      await O.page
        .getByRole("checkbox", { name: new RegExp(v.name.replace(".", "\\.")) })
        .check();
    await O.page
      .getByLabel("작업 지시")
      .fill(
        "두 영상을 함께 보고 두 번째 영상부터 시작하는 러프컷을 구성해 주세요.",
      );
    let quoteKey = "";
    await O.page.route(
      "**/ai/quotes",
      async (route) => {
        quoteKey = JSON.parse(route.request().postData()!).requestKey;
        await route.fetch();
        await route.abort("connectionreset");
      },
      { times: 1 },
    );
    await O.page
      .getByRole("button", { name: "견적 받기", exact: true })
      .click();
    await expect(
      O.page.getByText("견적 요청 결과를 확인하지 못했습니다."),
    ).toBeVisible();
    await O.page
      .getByRole("button", { name: "같은 요청 확인", exact: true })
      .click();
    await expect(
      O.page.getByRole("heading", { name: "견적", exact: true }),
    ).toBeVisible();
    const quote = (
      await json(
        request.get(`${root}/ai/quote-requests/${quoteKey}`, {
          headers: owner.headers,
        }),
      )
    ).quote as TeamAiQuote;
    expect(quote.roughcut).toBeTruthy();
    expect(quote.inputs.map((i) => i.versionId)).toEqual(
      versions.map((v) => v.id),
    );
    expect(quote.inputs.every((i) => Number.isSafeInteger(i.durationMs))).toBe(
      true,
    );
    await expect(O.page.getByText(/이 견적의 러프컷 제한/)).toBeVisible();
    await expect(
      O.page.getByRole("button", { name: "실행", exact: true }),
    ).toBeDisabled();
    await O.page.getByRole("checkbox", { name: /예약에 동의합니다/ }).check();
    let submitKey = "";
    await O.page.route(
      "**/ai/jobs",
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        submitKey = JSON.parse(route.request().postData()!).requestKey;
        await route.fetch();
        await route.abort("connectionreset");
      },
      { times: 1 },
    );
    await O.page.getByRole("button", { name: "실행", exact: true }).click();
    await expect(
      O.page.getByRole("heading", { name: "작업 진행" }),
    ).toBeVisible({ timeout: 30000 });
    const submission = await json(
      request.get(`${root}/ai/submissions/${submitKey}`, {
        headers: owner.headers,
      }),
    );
    const jobId = submission.job.id as string;
    await O.page.reload();
    await expect(O.page.getByText("결과가 준비되었습니다.")).toBeVisible({
      timeout: 60000,
    });
    const view = (await json(
      request.get(`${root}/ai/jobs/${jobId}/execution`, {
        headers: owner.headers,
      }),
    )) as TeamAiExecution;
    expect(view.job.state).toBe("completed");
    expect(view.result?.format).toBe("prepix.team-ai.roughcut/v1");
    expect(view.result?.completedStages).toBe(1);
    expect(view.result?.totalStages).toBe(1);
    await expect(
      O.page.getByRole("region", { name: "러프컷 편집안" }),
    ).toHaveCount(0);
    await O.page
      .getByRole("button", { name: "결과 받기", exact: true })
      .click();
    const preview = O.page.getByRole("region", { name: "러프컷 편집안" });
    await expect(preview).toBeVisible();
    const items = preview.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText(versions[1].name);
    await expect(items.nth(1)).toContainText(versions[0].name);
    const downloading = O.page.waitForEvent("download");
    await O.page
      .getByRole("button", { name: "JSON 파일로 저장", exact: true })
      .click();
    const download = await downloading,
      bytes = await readFile((await download.path())!);
    expect(hash(bytes)).toBe(view.result!.sha256);
    const plan = JSON.parse(bytes.toString()) as TeamAiRoughcutResultDocument;
    expect(plan.jobId).toBe(jobId);
    expect(plan.quoteId).toBe(quote.id);
    expect(plan.instructionSha256).toBe(quote.instructionSha256);
    expect(plan.plan.model).toBe(quote.roughcut!.model);
    expect(plan.inputs.map((i) => i.inputVersionId)).toEqual(
      versions.map((v) => v.id),
    );
    expect(plan.plan.clips.map((i) => i.inputVersionId)).toEqual(
      [...versions].reverse().map((v) => v.id),
    );
    await O.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await O.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await testInfo.attach("roughcut mobile preview", {
      body: await O.page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    await O.page.setViewportSize({ width: 1360, height: 1100 });
    const saved = await O.page.evaluate(() =>
      Object.entries(localStorage).filter(([k]) =>
        k.startsWith("prepix-b2b-ai-run:"),
      ),
    );
    await O.page.goto(`/dashboard/workspaces/${team}`);
    const home = (await json(
      request.get(`${endpoint}/home`, { headers: owner.headers }),
    )) as TeamHome;
    expect(home.aiJobs.items.some((j) => j.id === jobId)).toBe(true);
    await O.page
      .getByRole("link", { name: /함께 분석할 두 원본.*에이전트/ })
      .click();
    await expect(O.page).toHaveURL(
      `${new URL(O.page.url()).origin}${path}?jobId=${jobId}`,
    );
    await O.page
      .getByRole("button", { name: "결과 받기", exact: true })
      .click();
    await expect(
      O.page.getByRole("region", { name: "러프컷 편집안" }),
    ).toBeVisible();
    expect(
      await O.page.evaluate(() =>
        Object.entries(localStorage).filter(([k]) =>
          k.startsWith("prepix-b2b-ai-run:"),
        ),
      ),
    ).toEqual(saved);
    await O.page.goto(path);
    await expect(
      O.page.getByRole("heading", { name: "작업 진행" }),
    ).toBeVisible();
    for (const [operation, label] of [
      ["transcript", "음성 전사"],
      ["vision", "영상 분석"],
    ] as const) {
      await O.page
        .getByRole("button", { name: "새 작업 준비", exact: true })
        .click();
      await O.page.getByRole("radio", { name: label, exact: true }).check();
      for (const v of versions)
        await O.page
          .getByRole("checkbox", {
            name: new RegExp(v.name.replace(".", "\\.")),
          })
          .check();
      await O.page
        .getByLabel("작업 지시")
        .fill(
          operation === "transcript"
            ? "두 영상의 음성을 정확히 받아 적어 주세요."
            : "두 영상의 장면을 분석해 주세요.",
        );
      await O.page
        .getByRole("button", { name: "견적 받기", exact: true })
        .click();
      await expect(
        O.page.getByRole("heading", { name: "견적", exact: true }),
      ).toBeVisible();
      await O.page.getByRole("checkbox", { name: /예약에 동의합니다/ }).check();
      await O.page.getByRole("button", { name: "실행", exact: true }).click();
      await expect(O.page.getByText("결과가 준비되었습니다.")).toBeVisible({
        timeout: 60000,
      });
      await O.page
        .getByRole("button", { name: "결과 받기", exact: true })
        .click();
      await expect(
        O.page.getByText(/받은 바이트의 SHA-256 확인됨/),
      ).toBeVisible();
      const record = await O.page.evaluate(() =>
        JSON.parse(
          Object.entries(localStorage).find(([k]) =>
            k.startsWith("prepix-b2b-ai-run:"),
          )![1],
        ),
      );
      const detail = (await json(
        request.get(`${root}/ai/jobs/${record.submit.jobId}/execution`, {
          headers: owner.headers,
        }),
      )) as TeamAiExecution;
      expect(detail.job.state).toBe("completed");
      expect(detail.result?.completedStages).toBe(2);
      const response = await json(
        request.get(
          `${root}/ai/results/${detail.result!.id}/content?sha256=${detail.result!.sha256}`,
          { headers: owner.headers },
        ),
      );
      const doc = JSON.parse(
        Buffer.from(response.contentBase64, "base64").toString(),
      ) as TeamAiResultDocument;
      expect(doc.operation).toBe(operation);
      expect(doc.items.map((i) => i.inputVersionId)).toEqual(
        versions.map((v) => v.id),
      );
      expect(doc.items.every((i) => i.output.kind === operation)).toBe(true);
    }
    expect(
      (
        await json(
          request.get(`${endpoint}/ai/jobs`, { headers: owner.headers }),
        )
      ).jobs,
    ).toHaveLength(3);
    expect(O.errors).toEqual([]);
  } finally {
    await mode(previous);
    await O.close();
  }
});
