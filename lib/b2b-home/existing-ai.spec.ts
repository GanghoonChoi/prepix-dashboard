import { test } from "node:test";
import assert from "node:assert/strict";
import { assertExistingAiScope, checkExistingAi } from "./existing-ai";
import type { TeamAiExecution } from "../api/generated/b2b";
const scope = {
  origin: "http://localhost:3328",
  userId: "actor",
  workspaceId: "team",
  projectId: "project",
};
const environment = {
  origin: scope.origin,
  userId: scope.userId,
  signedIn: true,
  pathname: "/dashboard/workspaces/team/projects/project/ai",
};
test("existing AI URL must retain exact job, account, route and service for its lifetime", () => {
  assertExistingAiScope(scope, "job", environment, "?jobId=job");
  for (const current of [
    { ...environment, userId: null },
    { ...environment, userId: "other" },
    { ...environment, signedIn: false },
    { ...environment, origin: "http://localhost:9999" },
    {
      ...environment,
      pathname: "/dashboard/workspaces/team/projects/other/ai",
    },
  ])
    assert.throws(() =>
      assertExistingAiScope(scope, "job", current, "?jobId=job"),
    );
  assert.throws(() =>
    assertExistingAiScope(scope, "job", environment, "?jobId=other"),
  );
  const abort = new AbortController();
  abort.abort();
  assert.throws(() =>
    assertExistingAiScope(
      scope,
      "job",
      environment,
      "?jobId=job",
      abort.signal,
    ),
  );
});
test("an execution belonging to another job, account, team or project cannot populate the exact job screen", () => {
  const view = {
    job: {
      id: "job",
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      userId: scope.userId,
    },
  } as TeamAiExecution;
  assert.equal(checkExistingAi(view, scope, "job"), view);
  for (const property of ["id", "workspaceId", "projectId", "userId"] as const)
    assert.throws(() =>
      checkExistingAi(
        { ...view, job: { ...view.job, [property]: "other" } },
        scope,
        "job",
      ),
    );
});
