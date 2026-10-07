import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
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
      // The real provider renders the real ./shared loader, which reads t().
      'export function useI18n(){return {lang:"ko",t:k=>k}}export function readLang(){return "ko"}',
    "./request-work": "export function RequestWorkPanel(){return null}",
    "./review-work": "export function ReviewWorkPanel(){return null}",
  };
  const result = await esbuild.build({
    stdin: {
      resolveDir: root,
      loader: "tsx",
      contents: `
      import React from "react";import {createRoot} from "react-dom/client";import {WorkspaceProvider,useWorkspace} from "./components/workspaces/workspace-context";import {apiClient} from "./lib/api/client";import {b2bService} from "./lib/api/services/b2b.service";import axios,{AxiosError} from "axios";
      window.client=apiClient;window.b2b=b2bService;apiClient.defaults.baseURL=location.origin+"/v2";
      window.configs=[];window.requests=[];window.retries=[];window.refreshes=[];window.privateReads=0;window.results={};window.release401={};window.releaseRefresh=[];window.hold401=[];window.holdSuccess=[];window.releaseSuccess={};window.refreshReject=false;window.retryFailure=false;
      window.session=(id,access,refresh)=>{if(id===null&&access===null&&refresh===null)localStorage.removeItem("sessionLineage");else localStorage.setItem("sessionLineage",crypto.randomUUID());if(id===null)localStorage.removeItem("userInfo");else localStorage.setItem("userInfo",JSON.stringify({id}));if(access===null)localStorage.removeItem("accessToken");else localStorage.setItem("accessToken",access);if(refresh===null)localStorage.removeItem("refreshToken");else localStorage.setItem("refreshToken",refresh);document.cookie="px_signed_in=1; path=/"};
      window.actor=id=>localStorage.setItem("userInfo",JSON.stringify({id}));window.rotate=(access,refresh)=>{localStorage.setItem("accessToken",access);localStorage.setItem("refreshToken",refresh)};window.start=(name,account)=>{window.results[name]="pending";apiClient.get("/private/"+name,account?{headers:{"X-Prepix-Account-ID":account}}:undefined).then(()=>window.results[name]="success").catch(error=>{window.results[name]=error.message||String(error.response?.status);window.name=JSON.stringify({message:error.message,hasConfig:!!error.config,includesRefresh:JSON.stringify(error.toJSON?.()??error).includes("original-refresh")})})};
      function PrivateChild(){const c=useWorkspace();const [mount]=React.useState(()=>++window.mounts);return <p data-mount={mount}>{c?.data.workspace.name}</p>};window.mounts=0;window.mountWorkspace=()=>createRoot(document.getElementById("root")).render(<WorkspaceProvider id="team"><PrivateChild/></WorkspaceProvider>);window.serialize=config=>new AxiosError("local proof","ERR_BAD_REQUEST",config).toJSON();
      apiClient.defaults.adapter=async config=>{window.configs.push(config);if(window.workspaceMode){let value;if(config.url==="/workspaces/team"){const saved={currentUserId:config.headers.Authorization==="Bearer new-access"?"new-actor":"original-actor",workspace:{id:"team",type:"team",name:"Original private workspace"}};window.privateReads++;if(window.holdWorkspace)await new Promise(r=>window.releaseWorkspace=r);value=saved}else if(config.url.endsWith("/b2b"))value={enabled:false,enrolled:false};else value={enabled:false};return {config,status:200,statusText:"OK",headers:{},data:{data:value}}}const name=config.url.split("/").at(-1);if(window.holdSuccess.includes(name)){await new Promise(r=>window.releaseSuccess[name]=r);return {config,status:200,statusText:"OK",headers:{},data:window.responseData??{data:{private:"old actor payload"}}}}window.requests.push({name,retry:!!config._retry,auth:config.headers.Authorization});if(config._retry){window.retries.push({name,auth:config.headers.Authorization,account:config.headers["X-Prepix-Account-ID"]});if(window.retryFailure)throw {config,response:{status:500}};return {config,status:200,statusText:"OK",headers:{},data:{ok:true}}}if(window.hold401.includes(name))await new Promise(r=>window.release401[name]=r);throw {config,response:{status:401,data:{message:"Unauthorized"}}}};
      axios.defaults.adapter=config=>new Promise((resolve,reject)=>{const index=window.refreshes.length;window.refreshes.push({url:config.url,token:JSON.parse(config.data).refreshToken});window.releaseRefresh[index]=()=>window.refreshReject?reject({config,response:{status:401}}):resolve({config,status:200,statusText:"OK",headers:{},data:{data:{accessToken:"rotated-access-"+index,refreshToken:"rotated-refresh-"+index}}})});
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
      "process.env.NEXT_PUBLIC_AUTH_ON_SITE": '"0"',
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
async function setup(page: import("@playwright/test").Page, login = true) {
  await page.route("http://localhost:3503/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html><body><div id="root"></div><p>API session proof</p></body></html>',
    }),
  );
  await page.goto(
    "http://localhost:3503/dashboard/workspaces/team/projects/project/files",
  );
  await page.addScriptTag({ content: bundle });
  if (login)
    await page.evaluate(
      'window.session("original-actor","original-access","original-refresh")',
    );
  return page;
}
async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    actor: JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id ?? null,
    access: localStorage.getItem("accessToken"),
    refresh: localStorage.getItem("refreshToken"),
    hint: document.cookie.includes("px_signed_in=1"),
  }));
}
for (const change of [
  "account",
  "same-account-login",
  "logout",
  "origin",
] as const) {
  test(`late initial 401 after ${change} cannot refresh, retry or erase the current session`, async ({
    page,
  }) => {
    await setup(page);
    await page.evaluate(
      'window.hold401=["old"];window.start("old","original-actor")',
    );
    await expect
      .poll(() => page.evaluate("typeof window.release401.old"))
      .toBe("function");
    await page.evaluate((change) => {
      const w = window as unknown as {
        session(id: string | null, a: string | null, r: string | null): void;
        client: { defaults: { baseURL: string } };
        release401: { old(): void };
      };
      if (change === "account")
        w.session("new-actor", "new-access", "new-refresh");
      if (change === "same-account-login")
        w.session("original-actor", "new-access", "new-refresh");
      if (change === "logout") w.session(null, null, null);
      if (change === "origin")
        w.client.defaults.baseURL = "http://other-service.invalid/v2";
      w.release401.old();
    }, change);
    const current = await state(page);
    await expect
      .poll(() => page.evaluate("window.results.old"))
      .toBe("API_SESSION_CHANGED");
    expect(await state(page)).toEqual(current);
    expect(await page.evaluate("window.refreshes.length")).toBe(0);
    expect(await page.evaluate("window.retries.length")).toBe(0);
    expect(page.url()).toContain("/projects/project/files");
  });
}
for (const change of [
  "account",
  "same-account-login",
  "logout",
  "origin",
  "late-refresh-error",
] as const) {
  test(`refresh response after ${change} cannot write old credentials or retry the original request`, async ({
    page,
  }) => {
    await setup(page);
    await page.evaluate('window.start("old","original-actor")');
    await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
    await page.evaluate((change) => {
      const w = window as unknown as {
        session(id: string | null, a: string | null, r: string | null): void;
        client: { defaults: { baseURL: string } };
        releaseRefresh: (() => void)[];
        refreshReject: boolean;
      };
      if (change === "account" || change === "late-refresh-error")
        w.session("new-actor", "new-access", "new-refresh");
      if (change === "same-account-login")
        w.session("original-actor", "new-access", "new-refresh");
      if (change === "logout") w.session(null, null, null);
      if (change === "origin")
        w.client.defaults.baseURL = "http://other-service.invalid/v2";
      if (change === "late-refresh-error") w.refreshReject = true;
      w.releaseRefresh[0]();
    }, change);
    const current = await state(page);
    await expect
      .poll(() => page.evaluate("window.results.old"))
      .not.toBe("pending");
    expect(await state(page)).toEqual(current);
    expect(await page.evaluate("window.retries.length")).toBe(0);
    expect(page.url()).toContain("/projects/project/files");
  });
}
test("concurrent 401 and a later old-token 401 share one rotation and retry only as the original actor", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.hold401=["late"];window.start("first","original-actor");window.start("second","original-actor");window.start("late","original-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await expect
    .poll(() => page.evaluate("typeof window.release401.late"))
    .toBe("function");
  await page.evaluate("window.releaseRefresh[0]()");
  await expect
    .poll(() => page.evaluate("[window.results.first,window.results.second]"))
    .toEqual(["success", "success"]);
  await page.evaluate("window.release401.late()");
  await expect.poll(() => page.evaluate("window.results.late")).toBe("success");
  expect(await page.evaluate("window.refreshes.length")).toBe(1);
  expect(
    await page.evaluate<{ auth: string; account: string }[]>("window.retries"),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        auth: "Bearer rotated-access-0",
        account: "original-actor",
      }),
    ]),
  );
  expect(
    (
      await page.evaluate<{ auth: string; account: string }[]>("window.retries")
    ).every(
      (r) =>
        r.auth === "Bearer rotated-access-0" && r.account === "original-actor",
    ),
  ).toBe(true);
  expect(await state(page)).toEqual({
    actor: "original-actor",
    access: "rotated-access-0",
    refresh: "rotated-refresh-0",
    hint: true,
  });
});
test("an old refresh completion cannot replace or remove a different actor’s concurrent refresh flight", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate('window.start("old","original-actor")');
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await page.evaluate(
    'window.session("new-actor","new-access","new-refresh");window.start("new","new-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(2);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect
    .poll(() => page.evaluate("window.results.old"))
    .toBe("API_SESSION_CHANGED");
  expect((await state(page)).access).toBe("new-access");
  await page.evaluate("window.releaseRefresh[1]()");
  await expect.poll(() => page.evaluate("window.results.new")).toBe("success");
  expect(await state(page)).toEqual({
    actor: "new-actor",
    access: "rotated-access-1",
    refresh: "rotated-refresh-1",
    hint: true,
  });
  expect(await page.evaluate("window.retries")).toEqual([
    { name: "new", auth: "Bearer rotated-access-1", account: "new-actor" },
  ]);
});
test("a missing actor blocks a scoped private request before transport and never refreshes", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.session(null,"unconfirmed-access","unconfirmed-refresh");window.start("null","original-actor")',
  );
  await expect
    .poll(() => page.evaluate("window.results.null"))
    .toBe("API_SESSION_CHANGED");
  expect(await page.evaluate("window.requests.length")).toBe(0);
  expect(await page.evaluate("window.refreshes.length")).toBe(0);
  expect((await state(page)).access).toBe("unconfirmed-access");
});
test("fresh same-session invalid credentials clear only that session and preserve its return destination", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.session("original-actor","original-access",null);window.start("old","original-actor")',
  );
  await page.waitForURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/dashboard/workspaces/team/projects/project/files",
  );
  expect(await state(page)).toEqual({
    actor: null,
    access: null,
    refresh: null,
    hint: false,
  });
});
test("an unrelated retry server failure preserves successfully refreshed credentials", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.retryFailure=true;window.start("old","original-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect
    .poll(() => page.evaluate("window.results.old"))
    .not.toBe("pending");
  expect(await state(page)).toEqual({
    actor: "original-actor",
    access: "rotated-access-0",
    refresh: "rotated-refresh-0",
    hint: true,
  });
  expect(page.url()).toContain("/projects/project/files");
});
for (const change of [
  "account",
  "same-account-login",
  "logout",
  "origin",
] as const) {
  test(`late private 2xx after ${change} is refused before the caller receives its payload`, async ({
    page,
  }) => {
    await setup(page);
    await page.evaluate(
      'window.holdSuccess=["old"];window.start("old","original-actor")',
    );
    await expect
      .poll(() => page.evaluate("typeof window.releaseSuccess.old"))
      .toBe("function");
    await page.evaluate((change) => {
      const w = window as unknown as {
        session(id: string | null, a: string | null, r: string | null): void;
        client: { defaults: { baseURL: string } };
        releaseSuccess: { old(): void };
      };
      if (change === "account")
        w.session("new-actor", "new-access", "new-refresh");
      if (change === "same-account-login")
        w.session("original-actor", "new-access", "new-refresh");
      if (change === "logout") w.session(null, null, null);
      if (change === "origin")
        w.client.defaults.baseURL = "http://other-service.invalid/v2";
      w.releaseSuccess.old();
    }, change);
    await expect
      .poll(() => page.evaluate("window.results.old"))
      .toBe("API_SESSION_CHANGED");
    expect(await page.evaluate("window.refreshes.length")).toBe(0);
  });
}
test("an old-token successful private response remains readable after its same-actor known rotation", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.holdSuccess=["old"];window.start("old","original-actor");window.start("expired","original-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect
    .poll(() => page.evaluate("window.results.expired"))
    .toBe("success");
  await page.evaluate("window.releaseSuccess.old()");
  await expect.poll(() => page.evaluate("window.results.old")).toBe("success");
  expect((await state(page)).access).toBe("rotated-access-0");
});
test("anonymous login response and authenticated profile bootstrap remain compatible", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.session(null,null,null);window.holdSuccess=["login"];window.start("login")',
  );
  await expect
    .poll(() => page.evaluate("typeof window.releaseSuccess.login"))
    .toBe("function");
  await page.evaluate("window.releaseSuccess.login()");
  await expect
    .poll(() => page.evaluate("window.results.login"))
    .toBe("success");
  // A browser can bootstrap its profile when only credentials are cached.
  await page.evaluate(
    'window.session(null,"bootstrap-access","bootstrap-refresh");window.holdSuccess=["profile"];window.responseData={data:{id:"profile-actor"}};void window.client.get("/users/profile").then(()=>window.results.profile="success").catch(e=>window.results.profile=e.message)',
  );
  await expect
    .poll(() => page.evaluate("typeof window.releaseSuccess.profile"))
    .toBe("function");
  // Another simultaneous profile read already confirmed exactly this actor.
  await page.evaluate(
    'window.actor("profile-actor");window.releaseSuccess.profile()',
  );
  await expect
    .poll(() => page.evaluate("window.results.profile"))
    .toBe("success");
  expect(await state(page)).toEqual({
    actor: "profile-actor",
    access: "bootstrap-access",
    refresh: "bootstrap-refresh",
    hint: true,
  });
});
test("unknown-actor profile bootstrap cannot be attributed to a different confirmed actor", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.session(null,"bootstrap-access","bootstrap-refresh");window.holdSuccess=["profile"];window.responseData={data:{id:"old-profile-actor"}};void window.client.get("/users/profile").then(()=>window.results.profile="success").catch(e=>window.results.profile=e.message)',
  );
  await expect
    .poll(() => page.evaluate("typeof window.releaseSuccess.profile"))
    .toBe("function");
  await page.evaluate(
    'window.actor("different-actor");window.releaseSuccess.profile()',
  );
  await expect
    .poll(() => page.evaluate("window.results.profile"))
    .toBe("API_SESSION_CHANGED");
  expect((await state(page)).actor).toBe("different-actor");
});
test("a private request crossing two proven rotations remains owned without trusting a same-actor new login", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.holdSuccess=["slow"];window.start("slow","original-actor");window.start("expired1","original-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect
    .poll(() => page.evaluate("window.results.expired1"))
    .toBe("success");
  await page.evaluate('window.start("expired2","original-actor")');
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(2);
  await page.evaluate("window.releaseRefresh[1]()");
  await expect
    .poll(() => page.evaluate("window.results.expired2"))
    .toBe("success");
  await page.evaluate("window.releaseSuccess.slow()");
  await expect.poll(() => page.evaluate("window.results.slow")).toBe("success");
  expect((await state(page)).access).toBe("rotated-access-1");
});
test("actual AxiosError.toJSON and raw config serialization never add refresh credentials from request snapshots", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate('window.start("old","original-actor")');
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  expect(
    await page.evaluate(
      'JSON.stringify(window.serialize(window.configs[0])).includes("original-refresh")',
    ),
  ).toBe(false);
  expect(
    await page.evaluate(
      'JSON.stringify(window.configs[0]).includes("original-refresh")',
    ),
  ).toBe(false);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect.poll(() => page.evaluate("window.results.old")).toBe("success");
  expect(
    await page.evaluate(
      'window.configs.every(c=>!["original-refresh","rotated-refresh-0"].some(secret=>JSON.stringify(window.serialize(c)).includes(secret)||JSON.stringify(c).includes(secret)))',
    ),
  ).toBe(true);
});
test("a failed refresh exposes a tokenless error instead of Axios config.data credentials", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate(
    'window.refreshReject=true;window.start("old","original-actor")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await page.evaluate("window.releaseRefresh[0]()");
  await page.waitForURL(/\/login\?/);
  const summary = await page.evaluate(() => JSON.parse(window.name));
  expect(summary).toEqual({
    message: "API_REFRESH_FAILED",
    hasConfig: false,
    includesRefresh: false,
  });
});
test("actual WorkspaceProvider unmounts old private children after a late old-actor 2xx while preserving the new session", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate("window.workspaceMode=true;window.mountWorkspace()");
  await expect(
    page.getByText("Original private workspace", { exact: true }),
  ).toBeVisible();
  await page.evaluate(
    'window.holdWorkspace=true;window.dispatchEvent(new Event("focus"))',
  );
  await expect
    .poll(() => page.evaluate("typeof window.releaseWorkspace"))
    .toBe("function");
  await page.evaluate(
    'window.session("new-actor","new-access","new-refresh");window.releaseWorkspace()',
  );
  await expect(
    page.getByText("Original private workspace", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "로그인 계정이나 연결된 서비스가 바뀌었습니다. 현재 계정으로 다시 불러오세요.",
    ),
  ).toBeVisible();
  expect(await state(page)).toEqual({
    actor: "new-actor",
    access: "new-access",
    refresh: "new-refresh",
    hint: true,
  });
  expect(await page.evaluate("window.refreshes.length")).toBe(0);
});
test("an account switch remounts private children so in-memory intents never cross accounts; the same account keeps them", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate("window.workspaceMode=true;window.mountWorkspace()");
  const child = page.getByText("Original private workspace", { exact: true });
  await expect(child).toHaveAttribute("data-mount", "1");
  await page.evaluate(
    'window.session("original-actor","same-access-2","same-refresh-2");window.dispatchEvent(new Event("focus"))',
  );
  await expect.poll(() => page.evaluate("window.privateReads")).toBe(2);
  await expect(child).toHaveAttribute("data-mount", "1");
  await page.evaluate(
    'window.session("new-actor","new-access","new-refresh");window.dispatchEvent(new Event("focus"))',
  );
  await expect(child).toHaveAttribute("data-mount", "2");
});

// Another tab of the same browser: shared localStorage, its own page and adapters.
const otherTab = async (page: import("@playwright/test").Page) =>
  setup(await page.context().newPage(), false);
test("another tab's normal refresh keeps this tab's in-flight 2xx and turns its later stale-token 401 into a retry without a second refresh", async ({
  page,
}) => {
  await setup(page);
  const b = await otherTab(page);
  await b.evaluate('window.holdSuccess=["ok"];window.start("ok","original-actor")');
  await expect.poll(() => b.evaluate("typeof window.releaseSuccess.ok")).toBe("function");
  await page.evaluate('window.rotate("rotated-A","rotated-refresh-A")');
  await b.evaluate("window.releaseSuccess.ok()");
  await expect.poll(() => b.evaluate("window.results.ok")).toBe("success");
  await b.evaluate('window.hold401=["late"];window.start("late","original-actor")');
  await expect.poll(() => b.evaluate("typeof window.release401.late")).toBe("function");
  await page.evaluate('window.rotate("rotated-A2","rotated-refresh-A2")');
  await b.evaluate("window.release401.late()");
  await expect.poll(() => b.evaluate("window.results.late")).toBe("success");
  expect(await b.evaluate("window.refreshes.length")).toBe(0);
  expect(await b.evaluate("window.retries")).toEqual([
    { name: "late", auth: "Bearer rotated-A2", account: "original-actor" },
  ]);
  expect((await state(b)).access).toBe("rotated-A2");
  // Signing in again as the same account is still fenced for work in flight.
  await b.evaluate('window.hold401=["fenced"];window.start("fenced","original-actor")');
  await expect.poll(() => b.evaluate("typeof window.release401.fenced")).toBe("function");
  await page.evaluate('window.session("original-actor","relogin-access","relogin-refresh")');
  await b.evaluate("window.release401.fenced()");
  await expect.poll(() => b.evaluate("window.results.fenced")).toBe("API_SESSION_CHANGED");
  expect(await b.evaluate("window.refreshes.length")).toBe(0);
});
test("two tabs whose tokens expire together spend the single-use refresh token once", async ({
  page,
}) => {
  await setup(page);
  const b = await otherTab(page);
  await page.evaluate('window.start("a","original-actor")');
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  await b.evaluate('window.start("b","original-actor")');
  await b.waitForTimeout(400);
  expect(await b.evaluate("window.refreshes.length")).toBe(0);
  await page.evaluate("window.releaseRefresh[0]()");
  await expect.poll(() => page.evaluate("window.results.a")).toBe("success");
  await expect.poll(() => b.evaluate("window.results.b")).toBe("success");
  expect(await b.evaluate("window.refreshes.length")).toBe(0);
  expect(await b.evaluate("window.retries")).toEqual([
    { name: "b", auth: "Bearer rotated-access-0", account: "original-actor" },
  ]);
  expect((await state(b)).refresh).toBe("rotated-refresh-0");
});
test("another tab signing in as someone else drops this tab's private children immediately and loads the new account", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate("window.workspaceMode=true;window.mountWorkspace()");
  const child = page.getByText("Original private workspace", { exact: true });
  await expect(child).toHaveAttribute("data-mount", "1");
  const reads = (await page.evaluate("window.privateReads")) as number;
  const b = await page.context().newPage();
  await b.route("http://localhost:3503/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html><body>other tab</body></html>" }),
  );
  await b.goto("http://localhost:3503/dashboard");
  await b.evaluate(() => {
    localStorage.setItem("sessionLineage", "other-tab-login");
    localStorage.setItem("accessToken", "new-access");
    localStorage.setItem("refreshToken", "new-refresh");
    localStorage.setItem("userInfo", JSON.stringify({ id: "new-actor" }));
  });
  // No focus event and no 30 s poll: the storage event alone remounts.
  await expect(child).toHaveAttribute("data-mount", "2");
  expect(await page.evaluate("window.privateReads")).toBeGreaterThan(reads);
});
test("a click before the reload, after another account signed in, is refused locally and sends nothing", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate("window.workspaceMode=true;window.mountWorkspace()");
  await expect(page.getByText("Original private workspace", { exact: true })).toBeVisible();
  // The same-document write fires no storage event: the view is still the old account's.
  await page.evaluate(
    'window.session("new-actor","new-access","new-refresh");window.b2b.createProject("team",{name:"x"}).catch(e=>window.mutation=e.message)',
  );
  await expect.poll(() => page.evaluate("window.mutation")).toBe("API_SESSION_CHANGED");
  expect(
    await page.evaluate("window.configs.filter(c=>c.method==='post').length"),
  ).toBe(0);
});
test("credentials with a corrupt actor cache still refresh, and a failed refresh signs that session out", async ({
  page,
}) => {
  await setup(page);
  await page.evaluate('localStorage.setItem("userInfo","{");window.start("c")');
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(1);
  expect(await page.evaluate("window.refreshes[0].token")).toBe("original-refresh");
  await page.evaluate("window.releaseRefresh[0]()");
  await expect.poll(() => page.evaluate("window.results.c")).toBe("success");
  expect(await page.evaluate('localStorage.getItem("accessToken")')).toBe("rotated-access-0");
  await page.evaluate(
    'window.refreshReject=true;window.rotate("stale","stale-refresh");localStorage.setItem("userInfo","{");window.start("d")',
  );
  await expect.poll(() => page.evaluate("window.refreshes.length")).toBe(2);
  await page.evaluate("window.releaseRefresh[1]()");
  await page.waitForURL(/\/login\?/);
  expect(
    await page.evaluate(
      '["accessToken","refreshToken","userInfo","sessionLineage"].map(k=>localStorage.getItem(k))',
    ),
  ).toEqual([null, null, null, null]);
});
