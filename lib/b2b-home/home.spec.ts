import { test } from "node:test";
import assert from "node:assert/strict";
import { readHome, type HomeScope, type HomeEnvironment } from "./home";
import type { TeamHome } from "../api/generated/b2b";
const scope: HomeScope = {
  origin: "http://localhost:3328",
  userId: "actor",
  workspaceId: "team",
};
const initial = (): HomeEnvironment => ({
  origin: scope.origin,
  userId: scope.userId,
  pathname: "/dashboard/workspaces/team",
  signedIn: true,
});
const value = () =>
  ({ currentUserId: scope.userId, workspaceId: scope.workspaceId }) as TeamHome;
for (const [name, change] of Object.entries({
  logout: (e: HomeEnvironment) => ({ ...e, userId: null, signedIn: false }),
  account: (e: HomeEnvironment) => ({ ...e, userId: "other" }),
  route: (e: HomeEnvironment) => ({
    ...e,
    pathname: "/dashboard/workspaces/other",
  }),
  origin: (e: HomeEnvironment) => ({ ...e, origin: "http://localhost:3399" }),
  missingActor: (e: HomeEnvironment) => ({ ...e, userId: null }),
}))
  test(`late home response refuses ${name} change`, async () => {
    let environment = initial(),
      release!: (v: TeamHome) => void;
    const pending = readHome(
      scope,
      () => environment,
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    environment = change(environment);
    release(value());
    await assert.rejects(pending, { message: "B2B_HOME_SCOPE_CHANGED" });
  });
test("cleanup abort rejects a transport that still returns old private data", async () => {
  const controller = new AbortController();
  let release!: (v: TeamHome) => void;
  const pending = readHome(
    scope,
    initial,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    controller.signal,
  );
  controller.abort();
  release(value());
  await assert.rejects(pending, { name: "AbortError" });
});
test("home must name the exact response actor and workspace", async () => {
  for (const changed of [
    { currentUserId: "other" },
    { workspaceId: "other" },
    { currentUserId: undefined },
  ])
    await assert.rejects(
      readHome(
        scope,
        initial,
        async () => ({ ...value(), ...changed }) as TeamHome,
      ),
      { message: "B2B_HOME_SCOPE_CHANGED" },
    );
});
test("a missing account fails before transport and network failure is not an empty home", async () => {
  let called = 0;
  await assert.rejects(
    readHome(
      scope,
      () => ({ ...initial(), userId: null }),
      async () => {
        called++;
        return value();
      },
    ),
  );
  assert.equal(called, 0);
  const outage = new Error("server unavailable");
  await assert.rejects(
    readHome(scope, initial, async () => {
      throw outage;
    }),
    (e) => e === outage,
  );
});
