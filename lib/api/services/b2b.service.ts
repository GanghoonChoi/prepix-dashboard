import { apiClient } from "../client";
import type {
  B2bStatus,
  ChangeAffiliation,
  ChangeParticipant,
  CreateProject,
  ProjectDetail,
  ProjectList,
  ProjectPeople,
  StoredProject,
  TransferLead,
  UpdateProject,
} from "../generated/b2b";
export type * from "../generated/b2b";
const e = encodeURIComponent;
const base = (id: string) => `/workspaces/${e(id)}/b2b`;
const projectPath = (id: string, projectId: string) =>
  `${base(id)}/projects/${e(projectId)}`;
async function get<T>(path: string): Promise<T> {
  return (await apiClient.get<{ data: T }>(path, { timeout: 15_000 })).data
    .data;
}
async function post<T>(path: string, input: unknown): Promise<T> {
  const result = (
    await apiClient.post<{ data: T }>(path, input, { timeout: 30_000 })
  ).data.data;
  window.dispatchEvent(new Event("workspaces:changed"));
  return result;
}
export const b2bService = {
  status: (id: string) => get<B2bStatus>(`${base(id)}/status`),
  projects: (
    id: string,
    query: { search?: string; state?: string; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined) as [
        string,
        string,
      ][],
    );
    return get<ProjectList>(`${base(id)}/projects?${params}`);
  },
  project: (id: string, projectId: string) =>
    get<ProjectDetail>(projectPath(id, projectId)),
  createProject: (id: string, input: CreateProject) =>
    post<{ project: StoredProject; revision: number; requestId: string }>(
      `${base(id)}/projects`,
      input,
    ),
  updateProject: (id: string, projectId: string, input: UpdateProject) =>
    post<{ revision: number; requestId: string }>(
      projectPath(id, projectId),
      input,
    ),
  people: (id: string, projectId: string) =>
    get<ProjectPeople>(`${projectPath(id, projectId)}/people`),
  changeParticipant: (
    id: string,
    projectId: string,
    input: ChangeParticipant,
  ) =>
    post<{ revision: number; requestId: string }>(
      `${projectPath(id, projectId)}/people`,
      input,
    ),
  transferLead: (id: string, projectId: string, input: TransferLead) =>
    post<{ revision: number; requestId: string }>(
      `${projectPath(id, projectId)}/lead`,
      input,
    ),
  changeAffiliation: (id: string, userId: string, input: ChangeAffiliation) =>
    post<{ revision: number; requestId: string }>(
      `${base(id)}/members/${e(userId)}`,
      input,
    ),
};
