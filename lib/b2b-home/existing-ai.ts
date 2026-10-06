import type { AiScope } from "../b2b-ai/run";
import type { TeamAiExecution } from "../api/generated/b2b";
import type { HomeEnvironment } from "./home";
export function assertExistingAiScope(
  scope: AiScope,
  jobId: string,
  current: HomeEnvironment,
  search: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const path = `/dashboard/workspaces/${scope.workspaceId}/projects/${scope.projectId}/ai`;
  if (
    !scope.userId ||
    !current.signedIn ||
    current.userId !== scope.userId ||
    current.origin !== scope.origin ||
    current.pathname !== path ||
    new URLSearchParams(search).get("jobId") !== jobId
  )
    throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
}
export function checkExistingAi(
  view: TeamAiExecution,
  scope: AiScope,
  jobId: string,
) {
  if (
    view.job.id !== jobId ||
    view.job.workspaceId !== scope.workspaceId ||
    view.job.projectId !== scope.projectId ||
    view.job.userId !== scope.userId
  )
    throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
  return view;
}
