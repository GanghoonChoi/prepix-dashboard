import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
const require = createRequire(resolve(process.cwd(), "package.json"));
interface Hooks {
  onResolve(
    options: { filter: RegExp },
    callback: (args: { path: string }) => { path: string; namespace: string },
  ): void;
  onLoad(
    options: { filter: RegExp; namespace: string },
    callback: (args: { path: string }) => {
      contents: string;
      loader: string;
      resolveDir: string;
    },
  ): void;
}
const esbuild = require(
  require.resolve("esbuild", { paths: [require.resolve("tsx")] }),
) as {
  build(options: {
    [key: string]: unknown;
    plugins: { name: string; setup(build: Hooks): void }[];
  }): Promise<{ outputFiles: { text: string }[] }>;
};
let bundle: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/navigation":
      "export function useSearchParams(){return new URLSearchParams(location.search)}",
    "next/link":
      'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
    "@/components/workspaces/workspace-context":
      "export function useWorkspace(){return window.fixture}",
    "@/components/workspaces/shared":
      'import React from "react"; export const primaryClass="",secondaryClass="",inputClass="";export function TeamLoading(){return <p>Loading</p>}export function Block({title,children,actions}){return <section><h2>{title}</h2>{actions}{children}</section>}export function ConfirmDialog({children}){return <div>{children}</div>}export function TeamShell({title,children}){return <main><h1>{title}</h1>{children}</main>}export function SpaceBadge(){return null}',
    "@/lib/i18n/context":
      'export function useI18n(){return {lang:"ko"}}export function readLang(){return "ko"}',
    "./request-work": "export function RequestWorkPanel(){return null}",
    "./review-work": "export function ReviewWorkPanel(){return null}",
  };
  const result = await esbuild.build({
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
    import React from "react";import {createRoot} from "react-dom/client";import {ProjectAiRun} from "./components/b2b/ai-run";import {apiClient} from "./lib/api/client";
    const root=createRoot(document.getElementById("root"));window.client=apiClient;window.calls=[];window.hold="";window.deny="";window.saved=[];
    window.mount=(payload)=>{window.payload=payload;window.fixture=payload.fixture;apiClient.defaults.baseURL=location.origin+"/v2";window.render()};
    window.render=()=>root.render(<React.StrictMode><ProjectAiRun projectId={window.payload.quote.projectId}/></React.StrictMode>);
    window.unmount=()=>root.unmount();
    const originalUrl=URL.createObjectURL;URL.createObjectURL=blob=>{blob.arrayBuffer().then(value=>window.saved.push(Array.from(new Uint8Array(value))));return originalUrl(blob)};HTMLAnchorElement.prototype.click=function(){window.savedFilename=this.download};
    apiClient.defaults.adapter=async config=>{const url=config.url;window.calls.push({method:config.method,url,account:config.headers['X-Prepix-Account-ID']});const stage=url.includes("/content?")?"content":url.includes("/results/")?"result":url.includes("/execution")?"execution":"quote";if(window.hold===stage)await new Promise(r=>window.release=r);if(window.deny===stage)throw {config,response:{status:403,data:{message:"B2B_AI_RESULT_ACCESS_ENDED"}}};const value=stage==="content"?window.payload.content:stage==="result"?{result:window.payload.content.result}:stage==="execution"?window.payload.execution:{quote:window.payload.quote};return {config,status:200,statusText:"OK",headers:{},data:{data:value}}};
  `,
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: resolve(root, "tsconfig.json"),
    define: {
      "process.env.NODE_ENV": '"development"',
      "process.env.NEXT_PUBLIC_API_URL": '"http://localhost:3000"',
    },
    plugins: [
      {
        name: "surrounding-providers",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(next\/(link|navigation)|@\/components\/workspaces\/(workspace-context|shared)|@\/lib\/i18n\/context|\.\/(request-work|review-work))$/,
            },
            (args) => ({ path: args.path, namespace: "stub" }),
          );
          build.onLoad({ filter: /.*/, namespace: "stub" }, (args) => ({
            contents: stubs[args.path],
            loader: "tsx",
            resolveDir: root,
          }));
        },
      },
    ],
  });
  bundle = result.outputFiles[0].text;
});
function payload() {
  const userId = randomUUID(),
    workspaceId = randomUUID(),
    projectId = randomUUID(),
    jobId = randomUUID(),
    quoteId = randomUUID();
  const inputs = [0, 1].map((n) => ({
    ordinal: n,
    versionId: randomUUID(),
    assetId: randomUUID(),
    name: `Exact source ${n + 1}.mp4`,
    sha256: String(n + 1).repeat(64),
    size: 100 + n,
    durationMs: 4000 + n * 1000,
    units: 2,
  }));
  const quote = {
    id: quoteId,
    workspaceId,
    projectId,
    jobId,
    operation: "agent",
    catalogVersion: "original-v1",
    instructionSha256: "a".repeat(64),
    maximumUnits: 5,
    estimatedUnits: 4,
    inputs,
    roughcut: {
      model: "original-model",
      maxClips: 4,
      maxTimelineDurationMs: 7000,
    },
    createdAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-10-06T01:00:00.000Z",
    availability: { submittable: false },
  };
  const document = {
    format: "prepix.team-ai.roughcut/v1",
    operation: "agent",
    workspaceId,
    projectId,
    jobId,
    quoteId,
    catalogVersion: "original-v1",
    instructionSha256: "a".repeat(64),
    complete: true,
    inputs: inputs.map((i) => ({
      ordinal: i.ordinal,
      inputVersionId: i.versionId,
      inputSha256: i.sha256,
      size: i.size,
      durationMs: i.durationMs,
    })),
    plan: {
      kind: "roughcut",
      provider: "gemini",
      model: "original-model",
      summary: "두 번째 영상으로 시작하고 첫 장면을 반복합니다.",
      clips: [
        {
          inputVersionId: inputs[1].versionId,
          inputSha256: inputs[1].sha256,
          startMs: 2500,
          endMs: 5000,
        },
        {
          inputVersionId: inputs[0].versionId,
          inputSha256: inputs[0].sha256,
          startMs: 0,
          endMs: 1000,
        },
        {
          inputVersionId: inputs[0].versionId,
          inputSha256: inputs[0].sha256,
          startMs: 0,
          endMs: 1000,
        },
      ],
    },
  };
  const bytes = Buffer.from(JSON.stringify(document)),
    sha256 = createHash("sha256").update(bytes).digest("hex");
  const result = {
    id: randomUUID(),
    jobId,
    format: document.format,
    mediaType: "application/json",
    size: bytes.length,
    sha256,
    complete: true,
    completedStages: 1,
    totalStages: 1,
    units: 3,
    createdAt: "2026-10-06T00:01:00.000Z",
  };
  return {
    fixture: {
      data: {
        currentUserId: userId,
        workspace: { id: workspaceId, name: "Roughcut race" },
      },
      b2b: {
        enrolled: true,
        team: { currentState: "active" },
        allowedActions: { projects: true },
      },
    },
    quote,
    document,
    content: { result, contentBase64: bytes.toString("base64") },
    execution: {
      job: {
        id: jobId,
        userId,
        workspaceId,
        projectId,
        quoteId,
        operation: "agent",
        state: "completed",
        maximumUnits: 5,
        confirmedUnits: 3,
        reservedUnits: 0,
        returnedUnits: 2,
        acceptedAt: "2026-10-06T00:00:00.000Z",
        deadline: "2026-10-07T00:00:00.000Z",
      },
      progress: { phase: "finished", completedStages: 1, totalStages: 1 },
      result,
    },
  };
}
async function mount(page: import("@playwright/test").Page, value = payload()) {
  const path = `/dashboard/workspaces/${value.quote.workspaceId}/projects/${value.quote.projectId}/ai?jobId=${value.quote.jobId}`;
  await page.route(`**${path}`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto(path);
  await page.evaluate((userId) => {
    localStorage.setItem("accessToken", "fixture");
    localStorage.setItem("userInfo", JSON.stringify({ id: userId }));
  }, value.fixture.data.currentUserId);
  await page.addScriptTag({ content: bundle });
  await page.evaluate(
    (value) => (window as unknown as { mount(v: unknown): void }).mount(value),
    value,
  );
  await expect(page.getByRole("button", { name: "결과 받기" })).toBeVisible();
  return value;
}
test("real receiver previews every ordered repeated cut and explicitly downloads exact canonical bytes", async ({
  page,
}) => {
  const value = await mount(page);
  await expect(page.getByRole("region", { name: "러프컷 편집안" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "결과 받기" }).click();
  const preview = page.getByRole("region", { name: "러프컷 편집안" });
  await expect(preview).toBeVisible();
  const rows = preview.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Exact source 2.mp4");
  await expect(rows.nth(1)).toContainText("Exact source 1.mp4");
  await expect(rows.nth(2)).toContainText("Exact source 1.mp4");
  await expect(rows.nth(0)).toContainText("0:02.500 — 0:05.000");
  await expect(rows.nth(2)).toContainText("0:03.500 — 0:04.500");
  expect(await page.evaluate("window.saved.length")).toBe(0);
  await page.getByRole("button", { name: "JSON 파일로 저장" }).click();
  await expect.poll(() => page.evaluate("window.saved.length")).toBe(1);
  const bytes = await page.evaluate<number[]>("window.saved[0]");
  expect(createHash("sha256").update(Buffer.from(bytes)).digest("hex")).toBe(
    value.content.result.sha256,
  );
  expect(Buffer.from(bytes).toString()).toBe(JSON.stringify(value.document));
  expect(await page.evaluate<{ method: string }[]>("window.calls")).toEqual(
    expect.arrayContaining([expect.objectContaining({ method: "get" })]),
  );
  expect(
    (await page.evaluate<{ method: string }[]>("window.calls")).every(
      (c) => c.method === "get",
    ),
  ).toBe(true);
});
for (const change of [
  "account",
  "logout",
  "origin",
  "route",
  "unmount",
  "team-access",
  "server-revoked",
] as const) {
  test(`late roughcut content after ${change} cannot preview or save`, async ({
    page,
  }) => {
    await mount(page);
    await page.evaluate('window.hold="content"');
    await page.getByRole("button", { name: "결과 받기" }).click();
    await expect
      .poll(() => page.evaluate("typeof window.release"))
      .toBe("function");
    await page.evaluate((change) => {
      const w = window as unknown as {
        client: { defaults: { baseURL: string } };
        fixture: { b2b: { allowedActions: { projects: boolean } } };
        render(): void;
        unmount(): void;
        deny: string;
        release(): void;
      };
      if (change === "account")
        localStorage.setItem("userInfo", JSON.stringify({ id: "new-account" }));
      if (change === "logout") {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("userInfo");
      }
      if (change === "origin")
        w.client.defaults.baseURL = "http://different-origin.invalid/v2";
      if (change === "route") history.replaceState(null, "", "/dashboard");
      if (change === "unmount") w.unmount();
      if (change === "team-access") {
        w.fixture.b2b.allowedActions.projects = false;
        w.render();
      }
      if (change === "server-revoked") w.deny = "content";
      w.release();
    }, change);
    await expect
      .poll(() =>
        page.evaluate(
          'window.calls.filter(c=>c.url.includes("/content?")).length',
        ),
      )
      .toBe(1);
    if (change !== "unmount" && change !== "team-access")
      await expect(page.getByRole("alert")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "러프컷 편집안" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "JSON 파일로 저장" }),
    ).toHaveCount(0);
    expect(await page.evaluate("window.saved.length")).toBe(0);
  });
}
test("result access revoked during explicit save prevents any download", async ({
  page,
}) => {
  await mount(page);
  await page.getByRole("button", { name: "결과 받기" }).click();
  await expect(
    page.getByRole("region", { name: "러프컷 편집안" }),
  ).toBeVisible();
  await page.evaluate('window.deny="result"');
  await page.getByRole("button", { name: "JSON 파일로 저장" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate("window.saved.length")).toBe(0);
  await expect(page.getByRole("region", { name: "러프컷 편집안" })).toHaveCount(
    0,
  );
});
for (const change of [
  "account",
  "logout",
  "origin",
  "route",
  "unmount",
] as const) {
  test(`save authority lookup late after ${change} cannot create a download`, async ({
    page,
  }) => {
    await mount(page);
    await page.getByRole("button", { name: "결과 받기" }).click();
    await expect(
      page.getByRole("region", { name: "러프컷 편집안" }),
    ).toBeVisible();
    await page.evaluate('window.hold="result"');
    await page.getByRole("button", { name: "JSON 파일로 저장" }).click();
    await expect
      .poll(() => page.evaluate("typeof window.release"))
      .toBe("function");
    await page.evaluate((change) => {
      const w = window as unknown as {
        client: { defaults: { baseURL: string } };
        unmount(): void;
        release(): void;
      };
      if (change === "account")
        localStorage.setItem("userInfo", JSON.stringify({ id: "another" }));
      if (change === "logout") localStorage.removeItem("userInfo");
      if (change === "origin")
        w.client.defaults.baseURL = "http://other.invalid";
      if (change === "route") history.replaceState(null, "", "/dashboard");
      if (change === "unmount") w.unmount();
      w.release();
    }, change);
    if (change !== "unmount")
      await expect(page.getByRole("alert")).toBeVisible();
    expect(await page.evaluate("window.saved.length")).toBe(0);
  });
}
test("valid result hash with an invalid exact-source manifest still cannot preview", async ({
  page,
}) => {
  const value = payload();
  value.document.inputs[0].durationMs++;
  const bytes = Buffer.from(JSON.stringify(value.document));
  value.content.contentBase64 = bytes.toString("base64");
  value.content.result.size = bytes.length;
  value.content.result.sha256 = createHash("sha256")
    .update(bytes)
    .digest("hex");
  value.execution.result = value.content.result;
  await mount(page, value);
  await page.getByRole("button", { name: "결과 받기" }).click();
  await expect(
    page.getByText("받은 결과의 형식을 확인할 수 없어 표시하지 않았습니다."),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "러프컷 편집안" })).toHaveCount(
    0,
  );
});
