import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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
    import React from "react";import {createRoot} from "react-dom/client";import {B2bHome} from "./components/b2b/home";import {ProjectAiRun} from "./components/b2b/ai-run";import {apiClient} from "./lib/api/client";
    const root=createRoot(document.getElementById("root"));window.client=apiClient;window.calls=[];window.hold=false;window.deny=false;
    window.mount=(fixture,home)=>{window.fixture=fixture;window.home=home;apiClient.defaults.baseURL=location.origin+"/v2";root.render(<React.StrictMode><B2bHome status={fixture.b2b} workspace={fixture.data.workspace}/></React.StrictMode>)};
    window.mountAi=(fixture,projectId,execution)=>{window.fixture=fixture;window.execution=execution;apiClient.defaults.baseURL=location.origin+"/v2";root.render(<React.StrictMode><ProjectAiRun projectId={projectId}/></React.StrictMode>)};
    window.unmount=()=>root.unmount();
    apiClient.defaults.adapter=async config=>{const saved=config.url.endsWith("/execution")?window.execution:window.home;window.calls.push({method:config.method,url:config.url,account:config.headers['X-Prepix-Account-ID']});if(window.hold)await new Promise(r=>window.releaseHome=r);if(window.deny)throw {config,response:{status:403,data:{message:"B2B_PROJECT_NOT_FOUND"}}};return {config,status:200,statusText:"OK",headers:{},data:{data:saved}}};
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
for (const change of [
  "unmount",
  "logout",
  "account",
  "route",
  "origin",
  "team-state",
  "workspace",
  "server-revoked",
] as const) {
  test(`home late response after ${change} cannot display private cards`, async ({
    page,
  }) => {
    const userId = randomUUID(),
      workspaceId = randomUUID(),
      projectId = randomUUID();
    const fixture = {
      data: {
        currentUserId: userId,
        workspace: { id: workspaceId, name: "Home race" },
      },
      b2b: {
        enrolled: true,
        team: { currentState: "active" },
        allowedActions: { projects: true, billing: false, manage: false },
      },
    };
    const home = {
      currentUserId: userId,
      workspaceId,
      serverTime: "2026-10-06T00:00:00.000Z",
      currentState: "active",
      period: null,
      periods: [],
      aiUsage: {
        reconciled: true,
        availableUnits: "12",
        sampledAt: "2026-10-06T00:00:00.000Z",
      },
      aiUsageError: null,
      projects: {
        items: [
          {
            id: projectId,
            name: "Authorized original project",
            state: "in_progress",
            role: "producer",
            updatedAt: "2026-10-06T00:00:00.000Z",
          },
        ],
        hasMore: false,
      },
      transfers: { items: [], hasMore: false },
      aiJobs: { items: [], hasMore: false },
      deliveries: { items: [], hasMore: false },
    };
    const path = `/dashboard/workspaces/${workspaceId}`;
    await page.route(`**${path}`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><div id="root"></div></body></html>',
      }),
    );
    await page.goto(path);
    await page.evaluate((userId) => {
      localStorage.setItem("userInfo", JSON.stringify({ id: userId }));
      localStorage.setItem("accessToken", "local-fixture");
    }, userId);
    await page.addScriptTag({ content: bundle });
    await page.evaluate(
      ({ fixture, home }) =>
        (window as unknown as { mount(f: unknown, h: unknown): void }).mount(
          fixture,
          home,
        ),
      { fixture, home },
    );
    await expect(
      page.getByRole("link", { name: /Authorized original project/ }),
    ).toBeVisible();
    expect(await page.evaluate("window.calls[0].account")).toBe(userId);
    await page.evaluate(
      "window.hold=true;window.dispatchEvent(new Event('focus'))",
    );
    await expect
      .poll(() => page.evaluate("typeof window.releaseHome"))
      .toBe("function");
    const scripts: Record<string, string> = {
      unmount: "window.unmount()",
      logout:
        "localStorage.removeItem('userInfo');localStorage.removeItem('accessToken')",
      account: `localStorage.setItem('userInfo',JSON.stringify({id:'${randomUUID()}'}))`,
      route: `history.replaceState(null,'','/dashboard/workspaces/${randomUUID()}')`,
      origin: "window.client.defaults.baseURL='https://other-api.example/v2'",
      "server-revoked": "window.deny=true",
      "team-state":
        "window.hold=false;window.fixture={...window.fixture,b2b:{...window.fixture.b2b,team:{currentState:'recovery'},allowedActions:{projects:false,billing:false,manage:false}}};window.home={...window.home,currentState:'recovery',projects:{items:[],hasMore:false}};window.mount(window.fixture,window.home)",
      workspace: `window.hold=false;history.replaceState(null,'','/dashboard/workspaces/${randomUUID()}');window.fixture={...window.fixture,data:{...window.fixture.data,workspace:{id:location.pathname.split('/').at(-1),name:'Other team'}}};window.home={...window.home,workspaceId:window.fixture.data.workspace.id,projects:{items:[],hasMore:false}};window.mount(window.fixture,window.home)`,
    };
    await page.evaluate(scripts[change]);
    if (change === "team-state")
      await expect(
        page.getByText("팀 자료 접근이 중지되었습니다.", { exact: false }),
      ).toBeVisible();
    if (change === "workspace")
      await expect(
        page.getByRole("heading", { name: "Other team" }),
      ).toBeVisible();
    await page.evaluate("window.releaseHome()");
    await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    await expect(
      page.getByRole("link", { name: /Authorized original project/ }),
    ).toHaveCount(0);
  });
}
for (const late of [false, true])
  test(`home exact AI job link is GET-only and ${late ? "rejects a late switched account" : "preserves the original saved run"}`, async ({
    page,
  }) => {
    const userId = randomUUID(),
      workspaceId = randomUUID(),
      projectId = randomUUID(),
      jobId = randomUUID();
    const path = `/dashboard/workspaces/${workspaceId}/projects/${projectId}/ai?jobId=${jobId}`;
    const fixture = {
      data: {
        currentUserId: userId,
        workspace: { id: workspaceId, name: "Exact home job" },
      },
      b2b: { enrolled: true, allowedActions: { projects: true } },
    };
    const execution = {
      job: {
        id: jobId,
        workspaceId,
        projectId,
        userId,
        quoteId: randomUUID(),
        operation: "transcript",
        state: "running",
        maximumUnits: 17,
        reservedUnits: 17,
        confirmedUnits: 0,
        returnedUnits: 0,
        acceptedAt: "2026-10-06T00:00:00.000Z",
        deadline: "2026-10-07T00:00:00.000Z",
      },
      progress: { phase: "running", totalStages: 2, completedStages: 0 },
      result: null,
    };
    await page.route(`**${path}`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<html><body><div id="root"></div></body></html>',
      }),
    );
    await page.goto(path);
    const storeKey = `prepix-b2b-ai-run:${JSON.stringify([new URL(page.url()).origin, userId, workspaceId, projectId])}`;
    await page.evaluate(
      ({ userId, storeKey }) => {
        localStorage.setItem("accessToken", "local-fixture");
        localStorage.setItem("userInfo", JSON.stringify({ id: userId }));
        localStorage.setItem(
          storeKey,
          '{"original":"retain this saved intent"}',
        );
      },
      { userId, storeKey },
    );
    await page.addScriptTag({ content: bundle });
    if (late) await page.evaluate("window.hold=true");
    await page.evaluate(
      ({ fixture, projectId, execution }) =>
        (
          window as unknown as {
            mountAi(f: unknown, p: string, e: unknown): void;
          }
        ).mountAi(fixture, projectId, execution),
      { fixture, projectId, execution },
    );
    if (late) {
      await expect
        .poll(() => page.evaluate("typeof window.releaseHome"))
        .toBe("function");
      await page.evaluate(
        `localStorage.setItem('userInfo',JSON.stringify({id:'${randomUUID()}'}));window.releaseHome()`,
      );
      await expect(
        page.getByText(
          "다른 계정, 팀 또는 요청의 응답이라 반영하지 않았습니다.",
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "작업 진행" }),
      ).toHaveCount(0);
    } else {
      await expect(
        page.getByRole("heading", { name: "작업 진행" }),
      ).toBeVisible();
      await expect(page.getByText("승인 최대량")).toBeVisible();
      await expect(page.getByRole("button", { name: "작업 취소" })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: "견적 받기" })).toHaveCount(
        0,
      );
    }
    expect(
      await page.evaluate(
        (storeKey) => localStorage.getItem(storeKey),
        storeKey,
      ),
    ).toBe('{"original":"retain this saved intent"}');
    const calls =
      await page.evaluate<{ url: string; method: string; account: string }[]>(
        "window.calls",
      );
    expect(calls.length).toBeGreaterThan(0);
    expect(
      calls.every(
        (c) =>
          c.method === "get" &&
          c.url.endsWith(`/jobs/${jobId}/execution`) &&
          c.account === userId,
      ),
    ).toBe(true);
  });
