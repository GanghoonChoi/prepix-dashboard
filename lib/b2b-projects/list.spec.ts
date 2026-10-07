import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectList } from "../api/generated/b2b";
import type { HomeEnvironment } from "../b2b-home/home";
import { decodeNavigation, encodeNavigation, initialNavigation, projectListKey, readProjectPages } from "./list";
const scope = { origin: "http://localhost:3338", userId: "actor", workspaceId: "team" };
const initial = (): HomeEnvironment => ({ ...scope, pathname: "/dashboard/workspaces/team/projects", signedIn: true });
const project = (id: string, workspaceId = scope.workspaceId) => ({ id, workspaceId, name: "Private title" }) as Project;
for (const [name, change] of Object.entries({
  account: (e: HomeEnvironment) => ({ ...e, userId: "other" }),
  logout: (e: HomeEnvironment) => ({ ...e, signedIn: false }),
  origin: (e: HomeEnvironment) => ({ ...e, origin: "http://localhost:3399" }),
  team: (e: HomeEnvironment) => ({ ...e, pathname: "/dashboard/workspaces/other/projects" }),
  detail: (e: HomeEnvironment) => ({ ...e, pathname: "/dashboard/workspaces/team/projects/private" }),
})) test(`project list refuses late ${name} response and refusal`, async () => {
  for (const failure of [false, true]) {
    let environment = initial(), release!: () => void;
    const pending = readProjectPages(scope, () => environment, 2, async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      if (failure) throw new Error("network error");
      return { projects: [project("private")], nextCursor: "private-cursor" };
    });
    environment = change(environment); release();
    await assert.rejects(pending, { message: "B2B_PROJECT_LIST_SCOPE_CHANGED" });
  }
});
test("missing actor rejects before transport and abort after await prevents page two", async () => {
  let calls = 0;
  await assert.rejects(readProjectPages(scope, () => ({ ...initial(), userId: null }), 1, async () => {
    calls++; return { projects: [], nextCursor: null };
  }));
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(readProjectPages(scope, initial, 2, async () => {
    calls++; controller.abort(); return { projects: [project("private")], nextCursor: "next" };
  }, controller.signal), { name: "AbortError" });
  assert.equal(calls, 1);
});
test("back restores only whitelisted navigation settings, partitioned by actor/origin/team", () => {
  const navigation = { search: "search", state: "draft", sort: "created-desc", pages: 3, scroll: 1650, projects: [project("private")], cursor: "secret" };
  assert.deepEqual(JSON.parse(encodeNavigation(navigation as ReturnType<typeof initialNavigation>)), {
    search: "search", state: "draft", sort: "created-desc", pages: 3, scroll: 1650,
  });
  for (const change of [{ userId: "other" }, { workspaceId: "other" }, { origin: "http://localhost:3399" }])
    assert.notEqual(projectListKey(scope), projectListKey({ ...scope, ...change }));
  for (const raw of ["broken", "null", JSON.stringify({ ...navigation, pages: 0 }), JSON.stringify({ ...navigation, state: "private-state" }), JSON.stringify({ ...navigation, sort: "name" })])
    assert.deepEqual(decodeNavigation(raw), initialNavigation());
});
test("fresh ACL replay starts at page one, uses only new cursors and stops at current end", async () => {
  const seen: (string | undefined)[] = [];
  const result = await readProjectPages(scope, initial, 4, async (cursor) => {
    seen.push(cursor);
    return cursor ? { projects: [project("b"), project("a")], nextCursor: null } : { projects: [project("a")], nextCursor: "fresh" };
  });
  assert.deepEqual(seen, [undefined, "fresh"]);
  assert.deepEqual(result.projects.map((p) => p.id), ["a", "b"]);
  assert.equal(result.pages, 2);
  assert.equal(result.nextCursor, null);
});
test("wrong workspace and a later page access refusal never return partial private rows", async () => {
  await assert.rejects(readProjectPages(scope, initial, 1, async () => ({ projects: [project("other", "other")], nextCursor: null })), { message: "B2B_PROJECT_LIST_SCOPE_CHANGED" });
  let calls = 0;
  const refusal = new Error("B2B_PROJECT_ACCESS_ENDED");
  await assert.rejects(readProjectPages(scope, initial, 2, async () => {
    if (calls++) throw refusal;
    return { projects: [project("private")], nextCursor: "next" };
  }), (error) => error === refusal);
});
test("a repeated server cursor fails instead of replaying indefinitely", async () => {
  await assert.rejects(readProjectPages(scope, initial, 5, async (): Promise<ProjectList> => ({ projects: [], nextCursor: "same" })), { message: "Repeated project cursor" });
});
