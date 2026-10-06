import { apiClient } from "../client";
import {
  BrowserRequestStore,
  requestsApi,
  runRequest,
  requestEvents,
  type RequestScope,
  type RequestRecord,
} from "../../b2b-requests/operations";
import type {
  CloseProjectRequest,
  CreateProjectRequest,
  DecideProjectRequestSubmission,
  ProjectRequestDetail,
  ProjectRequestList,
  SubmitProjectRequest,
  UpdateProjectRequest,
} from "../generated/b2b";
const e = encodeURIComponent;
const root = (team: string, project: string) =>
  `/workspaces/${e(team)}/b2b/projects/${e(project)}/requests`;
const store = new BrowserRequestStore();
export const requestScope = (
  team: string,
  project: string,
  account: string,
): RequestScope => ({
  origin: new URL(apiClient.defaults.baseURL!).origin,
  userId: account,
  workspaceId: team,
  projectId: project,
});
async function get<T extends { currentUserId: string }>(
  path: string,
  account: string,
) {
  const value = (
    await apiClient.get<{ data: T }>(path, {
      timeout: 15000,
      headers: { "X-Prepix-Account-ID": account },
    })
  ).data.data;
  if (value.currentUserId !== account)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  return value;
}
async function post(
  team: string,
  project: string,
  account: string,
  action: RequestRecord["action"],
  input: object & { requestKey: string },
  target?: string,
  submissionId?: string,
) {
  const scope = requestScope(team, project, account);
  const record: RequestRecord = {
    schema: 1,
    scope,
    action,
    input: input as RequestRecord["input"],
    attempts: 0,
    ...(target ? { target } : {}),
    ...(submissionId ? { submissionId } : {}),
  };
  try {
    return await runRequest(
      record,
      requestsApi(scope),
      store,
      new AbortController().signal,
    );
  } finally {
    window.dispatchEvent(new CustomEvent(requestEvents, { detail: scope }));
  }
}
export const requestsService = {
  list: (
    team: string,
    project: string,
    account: string,
    query: { cursor?: string; view?: "all" | "mine" | "waiting" | "done" } = {},
  ) =>
    get<ProjectRequestList>(
      `${root(team, project)}?${new URLSearchParams(query).toString()}`,
      account,
    ),
  detail: (team: string, project: string, id: string, account: string) =>
    get<ProjectRequestDetail>(`${root(team, project)}/${e(id)}`, account),
  create: (
    team: string,
    project: string,
    account: string,
    input: CreateProjectRequest,
  ) => post(team, project, account, "create", input),
  update: (
    team: string,
    project: string,
    account: string,
    id: string,
    input: UpdateProjectRequest,
  ) => post(team, project, account, "update", input, id),
  accept: (
    team: string,
    project: string,
    account: string,
    id: string,
    input: UpdateProjectRequest,
  ) => post(team, project, account, "accept", input, id),
  close: (
    team: string,
    project: string,
    account: string,
    id: string,
    input: CloseProjectRequest,
  ) => post(team, project, account, "close", input, id),
  reopen: (
    team: string,
    project: string,
    account: string,
    id: string,
    input: CloseProjectRequest,
  ) => post(team, project, account, "reopen", input, id),
  submit: (
    team: string,
    project: string,
    account: string,
    id: string,
    input: SubmitProjectRequest,
  ) => post(team, project, account, "submit", input, id),
  decide: (
    team: string,
    project: string,
    account: string,
    id: string,
    submission: string,
    input: DecideProjectRequestSubmission,
  ) => post(team, project, account, "decide", input, id, submission),
  pending: (team: string, project: string, account: string) =>
    store.list(requestScope(team, project, account)),
};
