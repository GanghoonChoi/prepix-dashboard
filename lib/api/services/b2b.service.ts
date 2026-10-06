import { apiClient } from "../client";
import type {
  B2bStatus,
  TeamAiJob,
  TeamAiJobList,
  TeamAiUsageOverview,
  EditingDeviceOverview,
  RetireEditingDevice,
  LicenceOverview,
  LicenceAssignment,
  UserAiBudget,
  AssignLicence,
  RevokeLicence,
  ScheduleLicenceRevocation,
  ChangeUserAiLimit,
  TeamCommerce,
  TeamQuote,
  CreateTeamQuote,
  Invitation,
  InvitationPreview,
  IssueInvitation,
  ChangeInvitation,
  TeamPeople,
  ChangeAffiliation,
  ChangeTeamMember,
  RecoverProjectLead,
  ProjectLeadRecovery,
  RequestOwnership,
  ResolveOwnership,
  OwnershipTransfer,
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
async function get<T>(path: string, account?: string): Promise<T> {
  return (
    await apiClient.get<{ data: T }>(path, {
      timeout: 15_000,
      ...(account ? { headers: { "X-Prepix-Account-ID": account } } : {}),
    })
  ).data.data;
}
async function post<T>(path: string, input: unknown): Promise<T> {
  const result = (
    await apiClient.post<{ data: T }>(path, input, { timeout: 30_000 })
  ).data.data;
  window.dispatchEvent(new Event("workspaces:changed"));
  return result;
}
export const b2bService = {
  aiUsage: (id: string) => get<TeamAiUsageOverview>(`${base(id)}/ai/usage`),
  aiJobs: (id: string, cursor?: string) =>
    get<TeamAiJobList>(
      `${base(id)}/ai/jobs${cursor ? `?cursor=${e(cursor)}` : ""}`,
    ),
  aiJob: (id: string, projectId: string, jobId: string) =>
    get<TeamAiJob>(`${projectPath(id, projectId)}/ai/jobs/${e(jobId)}`),
  cancelAiJob: (
    id: string,
    projectId: string,
    jobId: string,
    requestKey: string,
  ) =>
    post<{ jobId: string; requestId: string }>(
      `${projectPath(id, projectId)}/ai/jobs/${e(jobId)}/cancel`,
      { requestKey },
    ),
  editingDevices: (id: string) =>
    get<EditingDeviceOverview>(`${base(id)}/licences/devices`),
  retireEditingDevice: (
    id: string,
    deviceId: string,
    input: RetireEditingDevice,
  ) =>
    post<{ deviceId: string; requestId: string }>(
      `${base(id)}/licences/devices/${e(deviceId)}/retire`,
      input,
    ),
  licences: (id: string, mine = false) =>
    get<LicenceOverview>(`${base(id)}/licences${mine ? "/mine" : ""}`),
  assignLicence: (id: string, input: AssignLicence) =>
    post<{ assignment: LicenceAssignment; requestId: string }>(
      `${base(id)}/licences/assignments`,
      input,
    ),
  revokeLicence: (id: string, assignmentId: string, input: RevokeLicence) =>
    post<{ assignment: LicenceAssignment; requestId: string }>(
      `${base(id)}/licences/assignments/${e(assignmentId)}/revoke`,
      input,
    ),
  scheduleLicence: (
    id: string,
    assignmentId: string,
    input: ScheduleLicenceRevocation,
  ) =>
    post<{ assignment: LicenceAssignment; requestId: string }>(
      `${base(id)}/licences/assignments/${e(assignmentId)}/schedule`,
      input,
    ),
  changeUserLimit: (
    id: string,
    periodId: string,
    userId: string,
    input: ChangeUserAiLimit,
  ) =>
    post<{ budget: UserAiBudget; requestId: string }>(
      `${base(id)}/licences/periods/${e(periodId)}/users/${e(userId)}/limit`,
      input,
    ),
  commerce: (id: string) => get<TeamCommerce>(`${base(id)}/commerce`),
  purchaseQuote: (id: string, input: CreateTeamQuote) =>
    post<{ quote: TeamQuote; requestId: string }>(
      `${base(id)}/commerce/quotes`,
      input,
    ),
  savedPurchaseQuote: (id: string, quoteId: string) =>
    get<{ quote: TeamQuote; expired: boolean }>(
      `${base(id)}/commerce/quotes/${e(quoteId)}`,
    ),
  invitation: (token: string) =>
    get<InvitationPreview>(`/b2b/invitations/${e(token)}`),
  acceptInvitation: (token: string) =>
    post<{
      workspaceId: string;
      projectId: string | null;
      alreadyAccepted: boolean;
    }>(`/b2b/invitations/${e(token)}/accept`, {}),
  invitations: (id: string, projectId?: string) =>
    get<{ invitations: Invitation[] }>(
      `${base(id)}/invitations${projectId ? `?projectId=${e(projectId)}` : ""}`,
    ),
  issueInvitation: (id: string, input: IssueInvitation) =>
    post<{ invitation: Invitation; revision: number; requestId: string }>(
      `${base(id)}/invitations`,
      input,
    ),
  changeInvitation: (
    id: string,
    invitationId: string,
    action: "resend" | "revoke",
    input: ChangeInvitation,
  ) =>
    post<{ invitation: Invitation; revision: number; requestId: string }>(
      `${base(id)}/invitations/${e(invitationId)}/${action}`,
      input,
    ),
  members: (id: string) => get<TeamPeople>(`${base(id)}/members`),
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
  project: (id: string, projectId: string, account?: string) =>
    get<ProjectDetail>(projectPath(id, projectId), account),
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
  requestOwnership: (id: string, input: RequestOwnership) =>
    post<{ transfer: OwnershipTransfer; revision: number; requestId: string }>(
      `${base(id)}/ownership`,
      input,
    ),
  resolveOwnership: (
    id: string,
    transferId: string,
    action: "accept" | "cancel" | "decline",
    input: ResolveOwnership,
  ) =>
    post<{ updated: true; revision: number; requestId: string }>(
      `${base(id)}/ownership/${e(transferId)}/${action}`,
      input,
    ),
  leave: (id: string, input: ChangeInvitation) =>
    post<{ left: true; requestId: string }>(`${base(id)}/leave`, input),
  changeTeamMember: (id: string, userId: string, input: ChangeTeamMember) =>
    post<{ revision: number; requestId: string }>(
      `${base(id)}/members/${e(userId)}/action`,
      input,
    ),
  leadRecovery: (id: string, projectId: string) =>
    get<ProjectLeadRecovery>(`${projectPath(id, projectId)}/lead-recovery`),
  recoverLead: (id: string, projectId: string, input: RecoverProjectLead) =>
    post<{ projectId: string; revision: number; requestId: string }>(
      `${projectPath(id, projectId)}/recover-lead`,
      input,
    ),
  changeAffiliation: (id: string, userId: string, input: ChangeAffiliation) =>
    post<{ revision: number; requestId: string }>(
      `${base(id)}/members/${e(userId)}`,
      input,
    ),
};
