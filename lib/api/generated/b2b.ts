// Generated from backend/src/b2b/contracts.ts. Run node scripts/sync-b2b-contract.mjs after a server contract change.
// Wire types shared by the web, desktop and operations clients. Date values
// are ISO instants; identifiers never carry local paths or invitation tokens.
export type TeamState =
  | "preparing"
  | "active"
  | "read_only"
  | "recovery"
  | "deletion_due"
  | "deleting"
  | "deleted";
export type ProjectState = "draft" | "in_progress" | "completed" | "archived";
export type ProjectRole = "lead" | "producer" | "reviewer";
export type ParticipationKind = "internal" | "external";
export type B2bStatus =
  | { enabled: false; enrolled: false }
  | { enabled: true; enrolled: false; canEnroll: boolean }
  | {
      enabled: true;
      enrolled: true;
      team: {
        workspaceId: string;
        policyVersion: string;
        currentState: TeamState;
        state: string;
        periodStartsAt: string | null;
        periodEndsAt: string | null;
        legacyArchive: boolean;
        revision: number;
      };
      member: {
        kind: ParticipationKind;
        billingAllowed: boolean;
        revision: number;
      };
      allowedActions: {
        projects: boolean;
        createProject: boolean;
        manage: boolean;
        billing: boolean;
      };
    };
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  brief: string;
  leadId: string | null;
  createdBy: string;
  state: ProjectState;
  shareOriginals: boolean;
  requiresWorkingFiles: boolean;
  completionRuleRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  role: ProjectRole;
  allowedActions: {
    read: boolean;
    edit: boolean;
    upload: boolean;
    managePeople: boolean;
    download: boolean;
  };
};
export type StoredProject = Omit<Project, "role" | "allowedActions">;
export type ProjectList = { projects: Project[]; nextCursor: string | null };
export type ProjectDetail = { project: Project };
export type ProjectPerson = {
  userId: string;
  name: string | null;
  email: string;
  role: ProjectRole;
  canDownload: boolean;
  revision: number;
  kind: ParticipationKind;
};
export type ProjectPeople = { people: ProjectPerson[]; canManage: boolean };
export type Mutation = { requestKey: string };
export type RevisionMutation = Mutation & { revision: number };
export type CreateProject = Mutation & {
  name: string;
  brief?: string;
  requiresWorkingFiles?: boolean;
  shareOriginals?: boolean;
};
export type UpdateProject = RevisionMutation & {
  name: string;
  brief: string;
  requiresWorkingFiles: boolean;
  shareOriginals: boolean;
};
export type ChangeParticipant = RevisionMutation & {
  userId: string;
  role: "producer" | "reviewer";
  canDownload: boolean;
  remove?: boolean;
  reason: string;
};
export type TransferLead = RevisionMutation & {
  targetId: string;
  reason: string;
};
export type ChangeAffiliation = RevisionMutation & {
  kind: ParticipationKind;
  billingAllowed: boolean;
  reason: string;
};

export type TeamRole = "owner" | "admin" | "editor" | "reviewer";
export type Invitation = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  email: string;
  kind: ParticipationKind;
  teamRole: Exclude<TeamRole, "owner">;
  projectRole: Exclude<ProjectRole, "lead"> | null;
  canDownload: boolean;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  deliveryState: "queued" | "sending" | "sent" | "failed";
  revision: number;
};
export type InvitationPreview = {
  workspaceId: string;
  workspaceName: string;
  projectId: string | null;
  projectName: string | null;
  kind: ParticipationKind;
  teamRole: Exclude<TeamRole, "owner">;
  projectRole: Exclude<ProjectRole, "lead"> | null;
  canDownload: boolean;
  expiresAt: string;
  accepted: boolean;
};
export type IssueInvitation = Mutation & {
  email: string;
  kind: ParticipationKind;
  teamRole: Exclude<TeamRole, "owner">;
  projectId?: string;
  projectRole?: Exclude<ProjectRole, "lead">;
  canDownload?: boolean;
  lang?: "ko" | "en";
};
export type ChangeInvitation = RevisionMutation & { reason: string };
export type TeamPerson = {
  userId: string;
  name: string | null;
  email: string;
  role: TeamRole;
  suspendedAt: string | null;
  kind: ParticipationKind;
  revision: number;
  billingAllowed?: boolean;
};
export type TeamPeople = { people: TeamPerson[]; canDelegateBilling: boolean };
