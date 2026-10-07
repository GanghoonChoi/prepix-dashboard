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
      'import {useMemo} from "react";export function useSearchParams(){return useMemo(()=>new URLSearchParams(location.search),[location.search])}export function useRouter(){return {push:url=>history.pushState(null,"",url),refresh(){}}}export function usePathname(){return location.pathname}',
    "next/link":
      'import React from "react"; export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}',
    "@/components/workspaces/workspace-context":
      "export function useWorkspace(){return window.fixture}",
    "@/components/workspaces/shared":
      'import React from "react"; export const primaryClass="",secondaryClass="",inputClass="";export function TeamLoading(){return <p>Loading</p>}export function Block({title,children,actions}){return <section><h2>{title}</h2>{actions}{children}</section>}export function ConfirmDialog({children}){return <div>{children}</div>}export function TeamShell({title,description,children}){return <main><h1>{title}</h1><p>{description}</p>{children}</main>}export function SpaceBadge(){return null}export function Details({summary,children}){return <details><summary>{summary}</summary>{children}</details>}export function EmptyState({title,description,action}){return <div><p>{title}</p>{description&&<p>{description}</p>}{action}</div>}export function Notice({children,role}){return <div role={role}>{children}</div>}export function KeyValues({items}){return <dl>{items.map(([k,v],i)=><div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}export function BackLink({href,children}){return <a href={href}>{children}</a>}',
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
    import React from "react";import {createRoot} from "react-dom/client";import {ProjectReviewView} from "./components/b2b/review-detail";import {apiClient} from "./lib/api/client";
    const root=createRoot(document.getElementById("root"));window.client=apiClient;window.calls=[];window.hold=false;
    window.mount=(fixture,detail,reviewId,projectId)=>{window.fixture=fixture;window.detail=detail;apiClient.defaults.baseURL=location.origin+"/v2";root.render(<React.StrictMode><ProjectReviewView projectId={projectId} reviewId={reviewId}/></React.StrictMode>)};
    apiClient.defaults.adapter=async config=>{const saved=structuredClone(window.detail);window.calls.push({url:config.url,method:config.method});if(window.hold)await new Promise(r=>window.releaseReview=r);return {config,status:200,statusText:"OK",headers:{},data:{data:saved}}};
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

for (const kind of ["old-round", "invalid-link", "wrong-response", "late-query-change"] as const) {
  test(`desktop exact review entry ${kind}`, async ({page}) => {
    const userId=randomUUID(), workspaceId=randomUUID(), projectId=randomUUID(), reviewId=randomUUID(), versionId=randomUUID();
    const path=`/dashboard/workspaces/${workspaceId}/projects/${projectId}/reviews/${reviewId}`;
    await page.route("**/dashboard/**", route=>route.fulfill({contentType:"text/html",body:'<html><body><div id="root"></div></body></html>'}));
    await page.goto(`http://review-entry.test${path}?round=1${kind === "invalid-link" ? "" : `&versionId=${versionId}`}`);
    await page.addScriptTag({content:bundle});
    const fixture={data:{currentUserId:userId,workspace:{id:workspaceId}},b2b:{enrolled:true,allowedActions:{projects:true}}};
    const detail={currentUserId:userId,access:"participant",review:{id:reviewId,projectId,title:"Original exact review",round:2,versionId:randomUUID(),revision:2,audienceConfirmed:true},
      rounds:[{round:1,versionId,ordinal:1,current:false,changeReason:null},{round:2,versionId:randomUUID(),ordinal:2,current:true,changeReason:null}],selectedRound:1,
      preview:{versionId:kind === "wrong-response" ? randomUUID() : versionId,state:"not_requested",durationMs:null,attempts:0,failureCode:null},
      approver:null,audience:[],approval:"no_approver",decisions:[],comments:[],share:null,
      allowedActions:{comment:false,decide:false,cancelDecision:false,setApprover:false,replaceVersion:false,share:false,retryPreview:false,download:false,setAudience:false}};
    await page.evaluate(({fixture,detail,reviewId,projectId,userId,kind})=>{
      localStorage.setItem("accessToken","fixture-token");localStorage.setItem("userInfo",JSON.stringify({id:userId}));
      const w=window as unknown as {hold:boolean;mount:(f:unknown,d:unknown,r:string,p:string)=>void};w.hold=kind === "late-query-change";w.mount(fixture,detail,reviewId,projectId);
    },{fixture,detail,reviewId,projectId,userId,kind});
    if(kind === "old-round") {
      await expect(page.getByRole("heading",{name:"Original exact review"})).toBeVisible();
      await expect(page.getByText(/이전 검토\(읽기 전용\)/)).toBeVisible();
      await expect(page.getByRole("button",{name:"V2 · 현재 검토",exact:true})).toBeDisabled();
      await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
      // Every re-read of the REVIEW stays pinned to the app's round. Other reads
      // on the page (the version's download permission) are not review reads.
      const reviewReads=()=>page.evaluate(()=>(window as unknown as {calls:{url:string}[]}).calls.filter(c=>c.url.includes("/reviews/")));
      await expect.poll(async()=>(await reviewReads()).length).toBeGreaterThan(1);
      expect((await reviewReads()).every(c=>c.url.endsWith("?round=1"))).toBe(true);
    } else {
      if(kind === "late-query-change") {
        await expect.poll(()=>page.evaluate(()=>typeof (window as unknown as {releaseReview?:unknown}).releaseReview)).toBe("function");
        await page.evaluate(()=>{history.replaceState(null,"",location.pathname+"?round=2&versionId=00000000-0000-4000-8000-000000000009");(window as unknown as {releaseReview:()=>void}).releaseReview();});
      }
      await expect(page.getByText("선택한 영상 버전의 검토를 열 수 없습니다. 검토 목록에서 현재 접근 가능한 버전을 확인해 주세요.")).toBeVisible();
      await expect(page.getByRole("heading",{name:"Original exact review"})).toHaveCount(0);
      if(kind === "invalid-link") expect(await page.evaluate(()=>(window as unknown as {calls:unknown[]}).calls.length)).toBe(0);
    }
  });
}
