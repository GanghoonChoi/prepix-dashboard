import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";

// Mount the real statement component in Chrome with only the surrounding app
// providers replaced. Delayed transport is controlled; PDF/storage/UI logic is
// the production source. This needs no API restart or real payment provider.
const require = createRequire(resolve(process.cwd(), "package.json"));
interface BundleHooks {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
  onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
}
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] })) as {
  build(options: { [key: string]: unknown; plugins: { name: string; setup(build: BundleHooks): void }[] }): Promise<{ outputFiles: { text: string }[] }>;
};
let bundle: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/link": 'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
    "@/components/workspaces/workspace-context": 'export function useWorkspace(){return window.fixture}',
    "@/components/workspaces/shared": 'import React from "react"; export const primaryClass="",secondaryClass=""; export function TeamShell({children,title}){return <main><h1>{title}</h1>{children}</main>} export function Block({children,title,description}){return <section><h2>{title}</h2><p>{description}</p>{children}</section>} export function SpaceBadge(){return null} export function TeamLoading(){return <p>Loading</p>}',
    "@/lib/i18n/context": 'export function useI18n(){return {lang:"ko"}} export function readLang(){return "ko"}',
  };
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React from "react"; import {createRoot} from "react-dom/client";
      import {TeamStatementMonth} from "./components/b2b/statements";
      import {apiClient} from "./lib/api/client";
      import {BrowserStatementStore,freshIssue,runIssue,legacyIssueKey} from "./lib/b2b-statements/statements";
      window.intent={BrowserStatementStore,freshIssue,runIssue,legacyIssueKey};
      const root=createRoot(document.getElementById("root"));
      window.mount=(fixture,detail)=>{window.fixture=fixture;window.detail=detail;apiClient.defaults.baseURL=location.origin+"/v2";root.render(<React.StrictMode><TeamStatementMonth month={detail.month}/></React.StrictMode>)};
      window.unmount=()=>root.unmount();
      window.client=apiClient; window.downloads=0; HTMLAnchorElement.prototype.click=function(){window.downloads++};
      window.requests=[]; window.holdPdf=false; window.holdDetail=false; window.denyDetail=false;
      apiClient.defaults.adapter=async config=>{
        window.requests.push(config.url);
        if(config.url.endsWith("/pdf")) {if(window.holdPdf)await new Promise(r=>window.resolvePdf=r); return {config,status:200,statusText:"OK",headers:{},data:new Uint8Array(window.pdfBytes).buffer}};
        if(window.holdDetail)await new Promise(r=>window.resolveDetail=r);
        if(window.denyDetail)throw {config,response:{status:403,data:{message:"B2B_BILLING_PERMISSION_REQUIRED"}}};
        return {config,status:200,statusText:"OK",headers:{},data:{data:window.detail}};
      };
    ` },
    bundle: true, write: false, format: "iife", jsx: "automatic", tsconfig: resolve(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": '"http://localhost:3000"' },
    plugins: [{ name: "surrounding-providers", setup(build) {
      build.onResolve({ filter: /^(next\/link|@\/components\/workspaces\/(workspace-context|shared)|@\/lib\/i18n\/context)$/ }, args => ({ path: args.path, namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});

for (const change of ["unmount", "logout", "account", "route", "permission", "origin", "server-revoked", "during-recheck"] as const) {
  test(`statement PDF late response after ${change} cannot save or display verified`, async ({ page }) => {
    const userId = randomUUID(), workspaceId = randomUUID(), month = "2027-01";
    const bytes = Buffer.from("%PDF-1.4\nlocal immutable race fixture\n%%EOF"), hash = createHash("sha256").update(bytes).digest("hex");
    const fixture = { data: { currentUserId: userId, workspace: { id: workspaceId, name: "Statement race" } }, b2b: { enrolled: true, allowedActions: { billing: true } } };
    const detail = { month, state: "issued", issueOn: "2027-02-01", revisions: [{ id: randomUUID(), month, revision: 1, previousId: null, reasons: ["initial"], issuedAt: "2027-02-01T00:00:00.000Z", issueOn: "2027-02-01", calendarVersion: "local", snapshotHash: hash, pdf: { sha256: hash, bytes: bytes.length }, snapshot: { totals: { supplyKrw: 0, vatKrw: 0, totalKrw: 0, receivedKrw: 0, refundedKrw: 0 }, byKind: [], recipients: [], recipient: null, purchases: [], adjustments: [], refunds: [], ai: [] } }] };
    const path = `/dashboard/workspaces/${workspaceId}/statements/${month}`;
    await page.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div></body></html>' }));
    await page.goto(path);
    await page.evaluate(({ userId, bytes }) => { localStorage.setItem("userInfo", JSON.stringify({ id: userId })); Object.assign(window, { pdfBytes: bytes }); }, { userId, bytes: [...bytes] });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(({ fixture, detail }) => { (window as unknown as { mount(f: unknown, d: unknown): void }).mount(fixture, detail); }, { fixture, detail });
    await expect(page.getByRole("button", { name: "PDF 받기" })).toBeVisible();
    // Control: the exact production component saves an intact issued PDF.
    await page.getByRole("button", { name: "PDF 받기" }).click();
    await expect.poll(() => page.evaluate("window.downloads")).toBe(1);
    await expect(page.getByText("SHA-256 일치 확인 · 저장을 시작했습니다")).toBeVisible();
    await page.evaluate("window.downloads=0; window.holdPdf=true");
    await page.getByRole("button", { name: "PDF 받기" }).click();
    await expect.poll(() => page.evaluate("typeof window.resolvePdf")).toBe("function");
    if (change === "during-recheck") {
      await page.evaluate("window.holdDetail=true; window.resolvePdf()");
      await expect.poll(() => page.evaluate("typeof window.resolveDetail")).toBe("function");
      await page.evaluate("window.unmount();window.resolveDetail()");
    } else {
      const changes: Record<string, string> = {
        unmount: "window.unmount()",
        logout: 'localStorage.removeItem("userInfo")',
        account: `localStorage.setItem("userInfo",JSON.stringify({id:"${randomUUID()}"}))`,
        route: `history.replaceState(null,"","/dashboard/workspaces/${randomUUID()}/statements/2027-01")`,
        permission: "window.fixture={...window.fixture,b2b:{...window.fixture.b2b,allowedActions:{billing:false}}};window.mount(window.fixture,window.detail)",
        origin: "window.client.defaults.baseURL='https://different-service.example/v2'",
        "server-revoked": "window.denyDetail=true",
      };
      await page.evaluate(changes[change]);
      // Permission changes commit cleanup before the late transport resolves.
      if (change === "permission") await expect(page.getByText(/결제 권한|청구 권한|B2B_BILLING_PERMISSION_REQUIRED/)).toBeVisible();
      await page.evaluate("window.resolvePdf()");
    }
    await expect.poll(() => page.evaluate("window.requests.filter(p=>p.endsWith('/pdf')).length")).toBe(2);
    // Flush both transport and React microtasks; bounded waiting is needed to
    // prove an absence, not to bypass hydration or readiness.
    await page.evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
    expect(await page.evaluate("window.downloads")).toBe(0);
    await expect(page.getByText("SHA-256 일치 확인 · 저장을 시작했습니다")).toHaveCount(0);
  });
}


test("statement original intent survives two Chrome tabs, late completion, reload and legacy migration", async ({ page, context }) => {
  const other = await context.newPage(), workspaceId = randomUUID(), userId = randomUUID(), month = "2027-01";
  const path = `/dashboard/workspaces/${workspaceId}/statements/${month}`;
  await context.route(`**${path}`, route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div></body></html>' }));
  for (const tab of [page, other]) {
    await tab.goto(path);
    await tab.addScriptTag({ content: bundle });
    await tab.evaluate(`window.scope={origin:location.origin,userId:"${userId}",workspaceId:"${workspaceId}"};window.month="${month}";window.store=new intent.BrowserStatementStore();window.r=intent.freshIssue(scope,month)`);
  }
  const [first, second] = await Promise.all([page.evaluate<{ requestKey: string }>("store.prepare(r)"), other.evaluate<{ requestKey: string }>("store.prepare(r)")]);
  expect(first.requestKey).toBe(second.requestKey);
  for (const tab of [page, other]) await tab.evaluate(`window.r=${JSON.stringify(first)}`);
  await Promise.all([page.evaluate("store.start(r)"), other.evaluate("store.start(r)")]);
  await page.evaluate("store.rejectFirst({...r,attempts:1})");
  expect(await other.evaluate("store.get(scope,month).then(r=>r.attempts)")).toBe(2);
  await page.evaluate("store.finish(r)");
  const replacement = await other.evaluate<{ requestKey: string }>("store.prepare(intent.freshIssue(scope,month))");
  await page.evaluate("store.finish(r)");
  expect(await other.evaluate("store.get(scope,month).then(r=>r.requestKey)")).toBe(replacement.requestKey);
  await other.reload();
  await other.addScriptTag({ content: bundle });
  await other.evaluate(`window.scope={origin:location.origin,userId:"${userId}",workspaceId:"${workspaceId}"};window.month="${month}";window.store=new intent.BrowserStatementStore()`);
  const receipt = { month, revision: { id: randomUUID(), month }, requestId: randomUUID(), created: true };
  await other.evaluate(`window.receipt=${JSON.stringify(receipt)}`);
  const recovered = await other.evaluate<{ sends: number; lookups: number; pending: unknown }>(`(async()=>{
    const r=await store.get(scope,month);await store.start(r);let sends=0,lookups=0;
    await intent.runIssue(intent.freshIssue(scope,month),{assertScope(){},async operation(month,requestKey,inputHash){lookups++;return {currentUserId:scope.userId,workspaceId:scope.workspaceId,month,requestKey,inputHash,receipt}},async issue(){sends++;throw Error("must not send")}},store);
    return {sends,lookups,pending:await store.get(scope,month)};
  })()`);
  expect(recovered).toEqual({ sends: 0, lookups: 1, pending: null });
  const migrated = await page.evaluate<{ original: string; current: string; attempts: number; legacy: unknown }>(`(async()=>{
    const original=crypto.randomUUID();localStorage.setItem(intent.legacyIssueKey(scope,month),JSON.stringify({schema:1,scope,month,requestKey:original}));
    const next=await store.prepare(intent.freshIssue(scope,month));return {original,current:next.requestKey,attempts:next.attempts,legacy:localStorage.getItem(intent.legacyIssueKey(scope,month))};
  })()`);
  expect(migrated.current).toBe(migrated.original);
  expect(migrated.attempts).toBe(1);
  expect(migrated.legacy).toBeNull();
  const blocked = await page.evaluate(`(async()=>{
    localStorage.setItem(intent.legacyIssueKey(scope,month),"{corrupt");
    try{await store.prepare(intent.freshIssue(scope,month));return "allowed"}catch(e){return {code:e.message,legacy:localStorage.getItem(intent.legacyIssueKey(scope,month))}}
  })()`);
  expect(blocked).toEqual({ code: "B2B_STATEMENT_RECOVERY_BLOCKED", legacy: "{corrupt" });
});
