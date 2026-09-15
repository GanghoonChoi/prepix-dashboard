import { apiClient } from "../client";

export type Role = "owner" | "admin" | "editor" | "reviewer";
export type InviteRole = Exclude<Role, "owner">;
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  /**
   * `personal` or `team` (spec D13). Every account has exactly one personal
   * workspace, auto-provisioned; it cannot be invited into, deleted, left or
   * transferred, and holds no seats.
   *
   * Optional only for servers older than the field, which is also why nothing
   * reads it directly — `lib/workspaces/kind.ts` owns the absent case.
   */
  type?: "personal" | "team";
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
  /**
   * How many more workspaces this account may create — the cap minus the ones
   * it created, floored at 0, and present even in the disabled response.
   *
   * `canCreate` already folds this in (`allowlisted && remainingCreations > 0`),
   * so branch on THAT and use this only to say how many are left. Optional
   * purely for servers older than the field.
   *
   * TEAMS ONLY (D13). The personal workspace is provisioned, not created, and
   * never counts against this — so never present it as "you can have N spaces".
   */
  remainingCreations?: number;
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
  /**
   * How many invitations are waiting for this address. Always sent; what
   * changes with verification is `invitations` above, which the server leaves
   * EMPTY for an unverified user — no names, no ids, no tokens — so an
   * unverified address cannot learn which teams invited it.
   *
   * So this is a count, never a verification signal: read `emailVerified` on
   * the profile for that. Optional only for servers older than the field.
   */
  pendingInvitationCount?: number;
};
export type WorkspaceDetail = {
  workspace: Workspace;
  canManageMembers?: boolean;
  managementEnabled?: boolean;
  pendingTransfer?: OwnershipTransfer | null;
  currentUserId?: string;
  role: Role;
  canManage: boolean;
  /**
   * Seats as separate figures, never one total (D02 reserves a seat for every
   * unexpired paid invitation), and `null` for a personal workspace, which is
   * outside seat accounting entirely.
   *
   * Read this through `seatFigures()` in lib/workspaces/kind.ts — it is the one
   * place that knows the null case and the pre-D13 `{ used, reserved }` names.
   */
  seats: Seats | null;
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
/**
 * `limit`…`remaining` are the current names; `used`/`reserved` are what a server
 * older than D13 sends. Every field is optional here so neither shape needs a
 * cast — `seatFigures()` resolves them into one set of numbers.
 */
export type Seats = {
  limit?: number;
  activeMembers?: number;
  pendingInvitations?: number;
  suspendedMembers?: number;
  freeReviewers?: number;
  remaining?: number;
  used?: number;
  reserved?: number;
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
    /** Null for a system action — a background sweep has no acting user. */
    actorEmail: string | null;
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
  /**
   * The team this invitation is for, so an already-accepted invitation links
   * straight there instead of dumping the user on the workspace list.
   * Optional only for servers older than the field.
   */
  workspaceId?: string;
  workspaceName: string;
  role: InviteRole;
  email: string;
  expiresAt: string;
  accepted: boolean;
};

/**
 * Every id below arrives from a route param or a server payload. `token` in
 * particular comes out of a `[token]` segment that Next has already decoded, so
 * an unencoded interpolation lets a crafted value walk out of the intended path
 * while still carrying the caller's bearer token. Encode all of them, the way
 * cloud.service.ts already does.
 */
const e = encodeURIComponent;

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
  ) => teamClient.post(`/workspaces/${e(id)}/settings`, input),
  leave: async (id: string) => teamClient.post(`/workspaces/${e(id)}/leave`),
  impact: async (id: string, userId: string) =>
    (
      await teamClient.get<{ data: MemberImpact }>(
        `/workspaces/${e(id)}/members/${e(userId)}/impact`,
      )
    ).data.data,
  management: async (id: string) =>
    (
      await teamClient.get<{
        data: { unassignedProjects: { id: string; name: string }[] };
      }>(`/workspaces/${e(id)}/management`)
    ).data.data,
  assign: async (id: string, projectId: string, targetId: string) =>
    teamClient.post(`/workspaces/${e(id)}/project-managers/${e(projectId)}`, {
      targetId,
    }),
  activity: async (id: string, cursor?: string) =>
    (
      await teamClient.get<{ data: TeamActivity }>(
        `/workspaces/${e(id)}/activity${cursor ? `?cursor=${e(cursor)}` : ""}`,
      )
    ).data.data,
  challenge: async (id: string, purpose: string) =>
    (
      await teamClient.post<{ data: Challenge }>(
        `/workspaces/${e(id)}/reauth-challenges`,
        { purpose },
      )
    ).data.data,
  transfer: async (id: string, targetId: string, credential: Credential) =>
    teamClient.post(`/workspaces/${e(id)}/ownership`, { targetId, ...credential }),
  resolveTransfer: async (
    id: string,
    transferId: string,
    action: "accept" | "cancel" | "decline",
    credential?: Credential,
  ) =>
    teamClient.post(
      `/workspaces/${e(id)}/ownership/${e(transferId)}/${action}`,
      credential,
    ),
  changeMember: async (
    id: string,
    userId: string,
    role: InviteRole | "remove" | "suspend" | "reactivate",
    successorId?: string,
  ) =>
    teamClient.post(`/workspaces/${e(id)}/members/${e(userId)}`, {
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
    (await teamClient.get<{ data: WorkspaceDetail }>(`/workspaces/${e(id)}`)).data
      .data,
  complete: async (id: string) =>
    teamClient.post(`/workspaces/${e(id)}/complete-onboarding`),
  invite: async (id: string, emails: string[], role: InviteRole) =>
    (
      await teamClient.post<{ data: { results: InviteResult[] } }>(
        `/workspaces/${e(id)}/invitations`,
        { emails, role },
      )
    ).data.data,
  resend: async (id: string, invitationId: string) =>
    (
      await teamClient.post<{ data: InviteResult }>(
        `/workspaces/${e(id)}/invitations/${e(invitationId)}/resend`,
      )
    ).data.data,
  revoke: async (id: string, invitationId: string) =>
    teamClient.post(`/workspaces/${e(id)}/invitations/${e(invitationId)}/revoke`),
  preview: async (token: string) =>
    (
      await teamClient.get<{ data: InvitePreview }>(
        `/workspaces/invitations/${e(token)}`,
      )
    ).data.data,
  /**
   * Accept an invitation addressed to the caller's own verified email, without
   * the emailed token. The list response carries ids but never tokens, so this
   * is what makes those rows actionable.
   */
  acceptPending: async (invitationId: string) =>
    (
      await teamClient.post<{ data: { workspaceId: string } }>(
        `/workspaces/invitations/accept-pending/${e(invitationId)}`,
      )
    ).data.data,
  accept: async (token: string) =>
    (
      await teamClient.post<{ data: { workspaceId: string } }>(
        `/workspaces/invitations/${e(token)}/accept`,
      )
    ).data.data,
};
