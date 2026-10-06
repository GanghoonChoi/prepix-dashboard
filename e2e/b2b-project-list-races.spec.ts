import { test, expect, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const require = createRequire(resolve(process.cwd(), "package.json"));
interface Hooks {
  onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }): void;
  onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }): void;
}
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("tsx")] })) as {
  build(options: { [key: string]: unknown; plugins: { name: string; setup(build: Hooks): void }[] }): Promise<{ outputFiles: { text: string }[] }>;
};
let bundle: string;
test.beforeAll(async () => {
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/navigation": "export function useRouter(){return {push:href=>window.navigate(href)}}",
    "next/link": 'import React from "react";export default function Link({href,children,onClick,...props}){return <a href={href} {...props} onClick={event=>{onClick?.(event);event.preventDefault();window.navigate(href)}}>{children}</a>}',
    "@/components/workspaces/workspace-context": "export function useWorkspace(){return window.fixture}",
    "@/components/workspaces/shared": 'import React from "react";export const primaryClass="",secondaryClass="",inputClass="";export function TeamLoading(){return <p>Loading</p>}export function TeamShell({title,children}){return <main><h1>{title}</h1>{children}</main>}export function SpaceBadge(){return null}',
    "@/lib/i18n/context": 'export function useI18n(){return {lang:"ko"}}export function readLang(){return "ko"}',
  };
  const result = await esbuild.build({
    stdin: { resolveDir: root, loader: "tsx", contents: `
      import React from "react";import {createRoot} from "react-dom/client";import {Projects} from "./components/b2b/projects";import {apiClient} from "./lib/api/client";
      const root=createRoot(document.getElementById("root"));window.client=apiClient;window.calls=[];window.pending=[];window.hold=false;window.deny=false;window.generation=0;
      window.render=()=>root.render(<React.StrictMode><React.Activity mode={location.pathname.endsWith("/projects")?"visible":"hidden"}><Projects/></React.Activity>{!location.pathname.endsWith("/projects")&&<p>Project detail</p>}</React.StrictMode>);
      window.navigate=href=>{history.pushState(null,"",href);window.render();window.scrollTo(0,0)};window.addEventListener("popstate",()=>window.render());
      window.mount=()=>{window.fixture={data:{currentUserId:"actor",workspace:{id:"team",name:"Team"}},b2b:{enrolled:true,team:{currentState:"active",revision:1},member:{kind:"internal",revision:1},allowedActions:{projects:true,createProject:false}}};localStorage.setItem("userInfo",JSON.stringify({id:"actor"}));localStorage.setItem("accessToken","fixture-token");apiClient.defaults.baseURL=location.origin+"/v2";window.render()};
      apiClient.defaults.adapter=async config=>{
        const params=new URLSearchParams(config.url.split("?")[1]);const cursor=params.get("cursor");const search=params.get("search")||"";const state=params.get("state")||"";const generation=window.generation;
        window.calls.push({cursor,search,state,account:config.headers['X-Prepix-Account-ID'],origin:config.baseURL});
        if(window.hold)await new Promise(resolve=>window.pending.push(resolve));
        if(window.deny)throw {config,response:{status:403,data:{message:"B2B_PROJECT_NOT_FOUND"}}};
        if(cursor&&cursor!=="fresh-"+generation)throw {config,response:{status:400,data:{message:"STALE_CURSOR"}}};
        const start=cursor?50:0;const projects=Array.from({length:50},(_,n)=>({id:"project-"+(start+n),workspaceId:"team",name:search+" "+(generation?"Current":"Private")+" "+(start+n),role:"lead",state:state||"draft"}));
        return {config,status:200,statusText:"OK",headers:{},data:{data:{projects,nextCursor:cursor?null:"fresh-"+generation}}};
      };
    ` }, bundle: true, write: false, format: "iife", jsx: "automatic", tsconfig: resolve(root, "tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"', "process.env.NEXT_PUBLIC_API_URL": '"http://localhost:3000"' },
    plugins: [{ name: "surrounding-providers", setup(build) {
      build.onResolve({ filter: /^(next\/(link|navigation)|@\/components\/workspaces\/(workspace-context|shared)|@\/lib\/i18n\/context)$/ }, args => ({ path: args.path, namespace: "stub" }));
      build.onLoad({ filter: /.*/, namespace: "stub" }, args => ({ contents: stubs[args.path], loader: "tsx", resolveDir: root }));
    } }],
  });
  bundle = result.outputFiles[0].text;
});
async function mount(page: Page) {
  await page.route("http://projects.test/**", route => route.fulfill({ contentType: "text/html", body: '<html><head><style>li{height:90px}input,select{display:block}body{margin:0}</style></head><body><div id="root"></div></body></html>' }));
  await page.goto("http://projects.test/dashboard/workspaces/team/projects");
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => (window as unknown as { mount(): void }).mount());
  await expect(page.getByRole("heading", { name: "Private 0", exact: true })).toBeVisible();
}
async function holdRefresh(page: Page) {
  await page.evaluate(() => { const w=window as unknown as {hold:boolean};w.hold=true;window.dispatchEvent(new Event("workspaces:changed")); });
  await expect.poll(() => page.evaluate(() => (window as unknown as {pending:unknown[]}).pending.length)).toBeGreaterThan(0);
}
for (const change of ["account", "logout", "origin"])
  test(`actual Chrome clears private projects and fences late ${change} response`, async ({ page }) => {
    await mount(page);await holdRefresh(page);
    await page.evaluate(change => {
      const w=window as unknown as {client:{defaults:{baseURL:string}}};
      if(change==="origin")w.client.defaults.baseURL="http://other-service.test/v2";
      else if(change==="account")localStorage.setItem("userInfo",JSON.stringify({id:"other"}));
      else localStorage.removeItem("accessToken");
      window.dispatchEvent(new StorageEvent("storage",{key:change==="logout"?"accessToken":"userInfo"}));
    }, change);
    await expect(page.getByRole("alert")).toContainText("계정 또는 서비스가 변경");
    await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
    await page.evaluate(() => { const w=window as unknown as {pending:(()=>void)[]};w.pending.splice(0).forEach(resolve=>resolve()); });
    await expect(page.getByRole("alert")).toContainText("계정 또는 서비스가 변경");
    await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
  });
test("actual Chrome new team authority removes rows while old transport completes",async({page})=>{
  await mount(page);await holdRefresh(page);
  await page.evaluate(()=>{const w=window as unknown as {fixture:{b2b:{allowedActions:{projects:boolean};member:{revision:number}}};render():void};w.fixture.b2b.allowedActions.projects=false;w.fixture.b2b.member.revision++;w.render();});
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(()=>{const w=window as unknown as {pending:(()=>void)[]};w.pending.splice(0).forEach(resolve=>resolve());});
  await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
});
test("actual Chrome origin fence works after await without a storage event",async({page})=>{
  await mount(page);await holdRefresh(page);
  await page.evaluate(()=>{const w=window as unknown as {client:{defaults:{baseURL:string}};pending:(()=>void)[]};w.client.defaults.baseURL="http://other-service.test/v2";w.pending.splice(0).forEach(resolve=>resolve());});
  await expect(page.getByRole("alert")).toContainText("계정 또는 서비스가 변경");
  await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
});
test("actual Chrome back restores filters/pages/scroll through a fresh ACL chain, without private cache",async({page})=>{
  await mount(page);
  await page.getByRole("textbox").fill("Filtered");
  await page.getByRole("combobox",{name:"상태"}).selectOption("in_progress");
  await expect(page.getByRole("heading",{name:"Filtered Private 0",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"더 보기",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Filtered Private 99",exact:true})).toBeAttached();
  await page.getByRole("link",{name:/Filtered Private 60/}).scrollIntoViewIfNeeded();
  const savedScroll=await page.evaluate(()=>window.scrollY);
  await page.getByRole("link",{name:/Filtered Private 60/}).click();
  await expect(page.getByText("Project detail",{exact:true})).toBeVisible();
  const saved=await page.evaluate(()=>Object.values(sessionStorage).map(value=>JSON.parse(value)));
  expect(saved).toHaveLength(1);
  expect(Object.keys(saved[0]).sort()).toEqual(["pages","scroll","search","sort","state"]);
  expect(saved[0]).toMatchObject({search:"Filtered",state:"in_progress",pages:2,sort:"created-desc"});
  expect(JSON.stringify(saved)).not.toMatch(/Private|project-60|fresh-0/);
  await page.evaluate(()=>{const w=window as unknown as {generation:number;calls:unknown[];hold:boolean};w.generation=1;w.calls=[];w.hold=true;});
  await page.goBack();
  await expect(page.getByRole("textbox")).toHaveValue("Filtered");
  await expect(page.getByRole("combobox")).toHaveValue("in_progress");
  await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {pending:unknown[]}).pending.length)).toBeGreaterThan(0);
  await page.evaluate(()=>{const w=window as unknown as {hold:boolean;pending:(()=>void)[]};w.hold=false;w.pending.splice(0).forEach(resolve=>resolve());});
  await expect(page.getByRole("heading",{name:"Filtered Current 99",exact:true})).toBeAttached();
  const calls=await page.evaluate(()=>(window as unknown as {calls:{cursor:string|null;account:string}[]}).calls);
  expect(calls.map(call=>call.cursor)).toEqual([null,"fresh-1"]);
  expect(calls.every(call=>call.account==="actor")).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeCloseTo(savedScroll,0);
  await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
});
test("actual Chrome back access refusal clears old titles and presents retry, never empty",async({page})=>{
  await mount(page);
  await page.getByRole("link",{name:/Private 0/}).first().click();
  await page.evaluate(()=>{(window as unknown as {deny:boolean}).deny=true;});
  await page.goBack();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button",{name:"다시 확인"})).toBeVisible();
  await expect(page.getByRole("heading",{name:/Private/})).toHaveCount(0);
  await expect(page.getByText("참여한 프로젝트가 없습니다.",{exact:false})).toHaveCount(0);
});
