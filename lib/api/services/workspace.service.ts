import { apiClient } from "../client";

export type Role = "owner" | "admin" | "editor" | "reviewer";
export type InviteRole = Exclude<Role, "owner">;
export type Workspace = {
  id: string;
  name: string;
  slug: string;
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
  workspaces: (Workspace & { role: Role })[];
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
  }[];
  invitations: Invitation[];
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
  post: <T = unknown>(path: string, body?: unknown) =>
    apiClient.post<T>(path, body, { timeout: 30_000 }),
};

export const workspaceService = {
  changeMember: async (
    id: string,
    userId: string,
    role: InviteRole | "remove",
  ) => teamClient.post(`/workspaces/${id}/members/${userId}`, { role }),
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
