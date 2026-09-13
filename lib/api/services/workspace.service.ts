import { apiClient } from "../client";

export type Role = "owner" | "admin" | "editor" | "reviewer";
export type InviteRole = Exclude<Role, "owner">;
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  revision?: number;
  seatLimit: number;
  onboardingCompletedAt: string | null;
  createdBy: string;
  createdAt: string;
};
export type Capabilities = {
  enabled: boolean;
  canCreate: boolean;
  previewSeats: number;
};
export type InviteResult = {
  email: string;
  status: string;
  invitationId?: string;
};
export type Invitation = {
  id: string;
  email: string;
  role: InviteRole;
  deliveryStatus: "sending" | "sent" | "failed";
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string;
};
export type WorkspaceList = {
  workspaces: (Workspace & {
    role: Role;
    suspendedAt?: string | null;
    managementEnabled?: boolean;
  })[];
  invitations: {
    id: string;
    workspaceName: string;
    role: InviteRole;
    expiresAt: string;
  }[];
};
export type WorkspaceDetail = {
  workspace: Workspace;
  canManageMembers?: boolean;
  managementEnabled?: boolean;
  pendingTransfer?: OwnershipTransfer | null;
  currentUserId?: string;
  role: Role;
  canManage: boolean;
  seats: { used: number; reserved: number };
  members: {
    userId: string;
    email: string;
    name: string | null;
    role: Role;
    joinedAt: string;
    suspendedAt?: string | null;
  }[];
  invitations: Invitation[];
};
export type OwnershipTransfer = {
  id: string;
  fromUserId: string;
  toUserId: string;
  expiresAt: string;
};
export type Credential = {
  challengeId: string;
  password?: string;
  idToken?: string;
};
export type Challenge = {
  id: string;
  nonce: string;
  expiresAt: string;
  passwordAvailable: boolean;
  googleAvailable: boolean;
};
export type MemberImpact = {
  projects: { id: string; name: string; archivedAt: string | null }[];
  pendingUploads: number;
  approvalResponsibilitiesEnabled: boolean;
};
export type TeamActivity = {
  events: {
    id: string;
    actorEmail: string;
    actorName: string | null;
    targetEmail: string | null;
    projectName: string | null;
    action: string;
    detail: Record<string, string>;
    createdAt: string;
  }[];
  nextCursor: string | null;
};
export type InvitePreview = {
  workspaceName: string;
  role: InviteRole;
  email: string;
  expiresAt: string;
  accepted: boolean;
};

const teamClient = {
  get: <T>(path: string) => apiClient.get<T>(path, { timeout: 15_000 }),
  post: async <T = unknown>(path: string, body?: unknown) => {
    const response = await apiClient.post<T>(path, body, { timeout: 30_000 });
    if (typeof window !== "undefined" && !path.endsWith("reauth-challenges"))
      window.dispatchEvent(new Event("workspaces:changed"));
    return response;
  },
};

export const workspaceService = {
  settings: async (
    id: string,
    input: { name: string; description: string; revision: number },
  ) => teamClient.post(`/workspaces/${id}/settings`, input),
  leave: async (id: string) => teamClient.post(`/workspaces/${id}/leave`),
  impact: async (id: string, userId: string) =>
    (
      await teamClient.get<{ data: MemberImpact }>(
        `/workspaces/${id}/members/${userId}/impact`,
      )
    ).data.data,
  management: async (id: string) =>
    (
      await teamClient.get<{
        data: { unassignedProjects: { id: string; name: string }[] };
      }>(`/workspaces/${id}/management`)
    ).data.data,
  assign: async (id: string, projectId: string, targetId: string) =>
    teamClient.post(`/workspaces/${id}/project-managers/${projectId}`, {
      targetId,
    }),
  activity: async (id: string, cursor?: string) =>
    (
      await teamClient.get<{ data: TeamActivity }>(
        `/workspaces/${id}/activity${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      )
    ).data.data,
  challenge: async (id: string, purpose: string) =>
    (
      await teamClient.post<{ data: Challenge }>(
        `/workspaces/${id}/reauth-challenges`,
        { purpose },
      )
    ).data.data,
  transfer: async (id: string, targetId: string, credential: Credential) =>
    teamClient.post(`/workspaces/${id}/ownership`, { targetId, ...credential }),
  resolveTransfer: async (
    id: string,
    transferId: string,
    action: "accept" | "cancel" | "decline",
    credential?: Credential,
  ) =>
    teamClient.post(
      `/workspaces/${id}/ownership/${transferId}/${action}`,
      credential,
    ),
  changeMember: async (
    id: string,
    userId: string,
    role: InviteRole | "remove" | "suspend" | "reactivate",
    successorId?: string,
  ) =>
    teamClient.post(`/workspaces/${id}/members/${userId}`, {
      role,
      ...(successorId ? { successorId } : {}),
    }),
  capabilities: async () =>
    (await teamClient.get<{ data: Capabilities }>("/workspaces/capabilities"))
      .data.data,
  list: async () =>
    (await teamClient.get<{ data: WorkspaceList }>("/workspaces")).data.data,
  create: async (name: string) =>
    (
      await teamClient.post<{
        data: { workspace: Workspace; resumed: boolean };
      }>("/workspaces", { name })
    ).data.data,
  detail: async (id: string) =>
    (await teamClient.get<{ data: WorkspaceDetail }>(`/workspaces/${id}`)).data
      .data,
  complete: async (id: string) =>
    teamClient.post(`/workspaces/${id}/complete-onboarding`),
  invite: async (id: string, emails: string[], role: InviteRole) =>
    (
      await teamClient.post<{ data: { results: InviteResult[] } }>(
        `/workspaces/${id}/invitations`,
        { emails, role },
      )
    ).data.data,
  resend: async (id: string, invitationId: string) =>
    (
      await teamClient.post<{ data: InviteResult }>(
        `/workspaces/${id}/invitations/${invitationId}/resend`,
      )
    ).data.data,
  revoke: async (id: string, invitationId: string) =>
    teamClient.post(`/workspaces/${id}/invitations/${invitationId}/revoke`),
  preview: async (token: string) =>
    (
      await teamClient.get<{ data: InvitePreview }>(
        `/workspaces/invitations/${token}`,
      )
    ).data.data,
  accept: async (token: string) =>
    (
      await teamClient.post<{ data: { workspaceId: string } }>(
        `/workspaces/invitations/${token}/accept`,
      )
    ).data.data,
};
