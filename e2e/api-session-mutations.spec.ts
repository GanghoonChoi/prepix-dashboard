import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

// The server applied a POST, then this browser's session changed before the
// 2xx arrived, so the client refused it locally (API_SESSION_CHANGED). Real
// Chrome, real client/stores/API wrappers; only transport is a
// fake that records what the server applied. The original key must survive and
// a later lookup with that key, as the same account, must settle it once.
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
const ORIGIN = "http://localhost:3701";
let bundle: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/navigation":
      "export function useSearchParams(){return new URLSearchParams(location.search)}export function usePathname(){return location.pathname}",
    "next/link":
      'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
    "@/components/workspaces/workspace-context":
      "export function useWorkspace(){return window.fixture}",
    "@/components/workspaces/shared":
      'import React from "react"; export const primaryClass="",secondaryClass="",inputClass="";export function TeamLoading(){return <p>Loading</p>}export function Block({title,description,children,actions}){return <section><h2>{title}</h2><p>{description}</p>{actions}{children}</section>}export function ConfirmDialog({children}){return <div>{children}</div>}export function TeamShell({title,children}){return <main><h1>{title}</h1>{children}</main>}export function SpaceBadge(){return null}',
    "@/lib/i18n/context":
      'export function useI18n(){return {lang:"ko",t:k=>k}}export function readLang(){return "ko"}',
    "./request-work": "export function RequestWorkPanel(){return null}",
    "./review-work": "export function ReviewWorkPanel(){return null}",
  };
  const result = await esbuild.build({
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
      import {apiClient} from "./lib/api/client";
      import {billingApi,BrowserBillingStore,runRecord} from "./lib/b2b-billing/operations";
      import {statementApi} from "./lib/api/services/b2b-statements.service";
      import {BrowserStatementStore,freshIssue,runIssue} from "./lib/b2b-statements/statements";
      import {reviewApi} from "./lib/api/services/b2b-reviews.service";
      import {BrowserReviewStore,runReview} from "./lib/b2b-reviews/operations";
      apiClient.defaults.baseURL=location.origin+"/v2";
      window.session=(id,access,refresh)=>{localStorage.setItem("sessionLineage",crypto.randomUUID());localStorage.setItem("userInfo",JSON.stringify({id}));localStorage.setItem("accessToken",access);localStorage.setItem("refreshToken",refresh)};
      const s=window.server={posts:[],gets:[],applied:{},hold:true};
      const uuid=()=>crypto.randomUUID();
      const ok=(config,data)=>({config,status:200,statusText:"OK",headers:{},data:{data}});
      function reply(url,body){const {month,reviewId}=window.ids;
        if(url.endsWith("/commerce/orders"))return {orderId:uuid(),providerOrderId:"provider-order",expiresAt:"2027-01-01T00:00:00.000Z",requestId:uuid()};
        if(url.endsWith("/issue"))return {month,revision:{id:uuid(),month},created:true,requestId:uuid()};
        if(url.endsWith("/decisions"))return {requestId:uuid(),review:{id:reviewId,revision:2,round:1},decisionId:uuid()};
        throw new Error("unexpected POST "+url)}
      apiClient.defaults.adapter=async config=>{const url=config.url,auth=config.headers.Authorization,account=config.headers["X-Prepix-Account-ID"];
        if(config.method==="post"){const body=JSON.parse(config.data);s.posts.push({url,key:body.requestKey,auth,account});const answer=reply(url,body);s.applied[body.requestKey]=answer;if(s.hold)await new Promise(r=>s.release=r);return ok(config,answer)}
        s.gets.push({url,auth,account});const {userId,workspaceId,month}=window.ids;const key=Object.keys(s.applied).find(k=>url.includes(k));const found=key?s.applied[key]:null;
        if(url.includes("/billing/operations/")||url.includes("/review-operations/"))return ok(config,{currentUserId:userId,receipt:found});
        if(url.includes("/issue-operations/")){const u=new URL(url,location.origin);return ok(config,{currentUserId:userId,workspaceId,month,requestKey:decodeURIComponent(u.pathname.split("/").at(-1)),inputHash:u.searchParams.get("inputHash"),receipt:found})}
        return ok(config,{})};
      // One flow per paid/irreversible family: start(key) runs the real runner.
      window.flows={
        billing:()=>{const {userId,workspaceId,quoteId}=window.ids,scope={origin:location.origin,userId,workspaceId},store=new BrowserBillingStore();const record=key=>({schema:1,scope,action:"order",topic:quoteId,attempts:0,input:{requestKey:key,quoteId,buyer:{name:"Local buyer",email:"buyer@example.test"}}});
          return {start:key=>runRecord(record(key),billingApi(scope),store),pending:async()=>(await store.list(scope)).map(r=>r.input.requestKey),others:async id=>(await store.list({...scope,userId:id})).length}},
        statements:()=>{const {userId,workspaceId,month}=window.ids,scope={origin:location.origin,userId,workspaceId},store=new BrowserStatementStore();
          return {start:key=>runIssue({...freshIssue(scope,month),requestKey:key},statementApi(scope),store),pending:async()=>{const r=await store.get(scope,month);return r?[r.requestKey]:[]},others:async id=>(await store.get({...scope,userId:id},month))?1:0}},
        reviews:()=>{const {userId,workspaceId,projectId,reviewId}=window.ids,scope={origin:location.origin,userId,kind:"project",workspaceId,projectId,reviewId},store=new BrowserReviewStore();
          return {start:key=>runReview({schema:1,scope,action:"decide",target:reviewId,input:{requestKey:key,decision:"approved"},attempts:0},reviewApi(scope),store,new AbortController().signal),pending:async()=>(await store.list(scope)).map(r=>r.input.requestKey),others:async id=>(await store.list({...scope,userId:id})).length}},
      };
      window.run=(name,key)=>{window.result=undefined;window.flows[name]().start(key).then(()=>window.result="success",e=>window.result=e.message)};
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
type Call = { url: string; key?: string; auth: string; account: string };
const ids = () => ({
  userId: randomUUID(),
  otherUserId: randomUUID(),
  workspaceId: randomUUID(),
  projectId: randomUUID(),
  reviewId: randomUUID(),
  quoteId: randomUUID(),
  month: "2027-01",
});
async function open(page: Page, path: string, value: ReturnType<typeof ids>) {
  await page.route(`${ORIGIN}/**`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div></body></html>',
    }),
  );
  await page.goto(`${ORIGIN}${path}`);
  await page.addScriptTag({ content: bundle });
  await page.evaluate((v) => {
    const w = window as unknown as {
      ids: unknown;
      session(id: string, a: string, r: string): void;
    };
    w.ids = v;
    w.session(v.userId, "access-1", "refresh-1");
  }, value);
}
/** Same person signs in again while the applied POST's reply is in flight. */
async function fenceAppliedPost(page: Page) {
  await expect
    .poll(() => page.evaluate("window.server.posts.length"))
    .toBe(1);
  await expect
    .poll(() => page.evaluate("typeof window.server.release"))
    .toBe("function");
  await page.evaluate(
    'window.session(window.ids.userId,"access-2","refresh-2");window.server.hold=false;window.server.release()',
  );
}
const posts = (page: Page) => page.evaluate<Call[]>("window.server.posts");
const gets = (page: Page) => page.evaluate<Call[]>("window.server.gets");

for (const flow of ["billing", "statements", "reviews"] as const) {
  for (const detour of [false, true]) {
    test(`${flow}: applied POST behind a local session fence keeps its original key and recovers once${detour ? " after another account comes and goes" : ""}`, async ({
      page,
    }) => {
      const value = ids();
      await open(
        page,
        `/dashboard/workspaces/${value.workspaceId}/projects/${value.projectId}`,
        value,
      );
      const original = randomUUID();
      await page.evaluate(([f, k]) => (window as unknown as { run(f: string, k: string): void }).run(f, k), [flow, original]);
      await fenceAppliedPost(page);
      await expect
        .poll(() => page.evaluate("window.result"))
        .toBe("API_SESSION_CHANGED");
      expect(
        await page.evaluate((f) => (window as unknown as { flows: Record<string, () => { pending(): Promise<string[]> }> }).flows[f]().pending(), flow),
      ).toEqual([original]);
      if (detour) {
        // Another account: the old intent is neither shown, sent nor erased.
        const before = (await gets(page)).length;
        await page.evaluate('window.session(window.ids.otherUserId,"other-access","other-refresh")');
        await page.evaluate(([f, k]) => (window as unknown as { run(f: string, k: string): void }).run(f, k), [flow, randomUUID()]);
        await expect.poll(() => page.evaluate("window.result")).not.toBe(undefined);
        expect(await page.evaluate("window.result")).not.toBe("success");
        expect((await gets(page)).length).toBe(before);
        expect((await posts(page)).length).toBe(1);
        expect(
          await page.evaluate((f) => (window as unknown as { flows: Record<string, () => { others(id: string): Promise<number> }> }).flows[f]().others((window as unknown as { ids: { otherUserId: string } }).ids.otherUserId), flow),
        ).toBe(0);
        expect(
          await page.evaluate((f) => (window as unknown as { flows: Record<string, () => { pending(): Promise<string[]> }> }).flows[f]().pending(), flow),
        ).toEqual([original]);
        await page.evaluate('window.session(window.ids.userId,"access-3","refresh-3")');
      }
      // A new click (new random key) resolves to the stored original key.
      await page.evaluate(([f, k]) => (window as unknown as { run(f: string, k: string): void }).run(f, k), [flow, randomUUID()]);
      await expect.poll(() => page.evaluate("window.result")).toBe("success");
      const sent = await posts(page);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ key: original, auth: "Bearer access-1", account: value.userId });
      const lookups = (await gets(page)).filter((g) => g.url.includes(original));
      // Reviews always look up before sending; the recovery is the only other.
      expect(lookups.map((g) => g.auth)).toEqual([
        ...(flow === "reviews" ? ["Bearer access-1"] : []),
        `Bearer ${detour ? "access-3" : "access-2"}`,
      ]);
      expect(lookups.every((g) => g.account === value.userId)).toBe(true);
      expect(
        await page.evaluate((f) => (window as unknown as { flows: Record<string, () => { pending(): Promise<string[]> }> }).flows[f]().pending(), flow),
      ).toEqual([]);
    });
  }
}
