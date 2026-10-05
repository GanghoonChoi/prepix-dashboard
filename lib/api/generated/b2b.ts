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
  accountUnavailable?: boolean;
};
export type TeamPeople = { people: TeamPerson[]; canDelegateBilling: boolean };

export type ChangeTeamMember = RevisionMutation & {
  action: "admin" | "editor" | "reviewer" | "remove" | "suspend" | "reactivate";
  reason: string;
};
export type RecoverProjectLead = RevisionMutation & {
  targetId: string;
  reason: string;
};

export type ProjectLeadRecovery = {
  projectId: string;
  revision: number;
  cause:
    | "lead_vacant"
    | "member_removed"
    | "membership_suspended"
    | "account_suspended";
  eligibleUserIds: string[];
};

export type OwnershipCredential = {
  challengeId: string;
  password?: string;
  idToken?: string;
};
export type RequestOwnership = RevisionMutation & {
  targetId: string;
  reason: string;
  credential: OwnershipCredential;
};
export type ResolveOwnership = RevisionMutation & {
  reason: string;
  credential?: OwnershipCredential;
};
export type OwnershipTransfer = {
  id: string;
  workspaceId: string;
  fromUserId: string;
  toUserId: string;
  expiresAt: string;
  resolvedAt: string | null;
  outcome: string | null;
  createdAt: string;
};

export type Rounding = "floor" | "ceil" | "half_up";
export type TeamProduct = {
  version: string;
  name: string;
  currency: "KRW";
  aiUnitLabel: string;
  aiUnitDescription: string;
  base: {
    supplyKrw: number;
    seats: number;
    aiUnits: number;
    storageBytes: number;
    transferBytes: number;
  };
  extraSeat: { supplyKrw: number; aiUnits: number };
  aiPack: {
    supplyKrw: number;
    units: number;
    currentPricing: "full_pack" | "remaining_time";
    validity: "period" | "days";
    validityDays: number | null;
    carry: boolean;
  };
  storagePack: {
    supplyKrw: number;
    bytes: number;
    currentPricing: "full_pack" | "remaining_time";
  };
  settlement: {
    vatBasisPoints: number;
    moneyRounding: Rounding;
    grantRounding: Rounding;
    quoteTtlSeconds: number;
    orderTtlSeconds: number;
    refundPolicyVersion: string;
  };
};
export type QuoteTarget = "initial" | "current" | "next" | "restore";
export type PurchaseSelection = {
  extraSeats: number;
  aiPacks: number;
  storagePacks: number;
};
export type CreateTeamQuote = PurchaseSelection & {
  requestKey: string;
  productVersion: string;
  target: QuoteTarget;
  renewal: "one_off" | "automatic";
  sourcePeriodId?: string;
};
export type TeamQuote = {
  conditions: TeamProduct;
  id: string;
  workspaceId: string;
  productVersion: string;
  conditionsHash: string;
  target: QuoteTarget;
  renewal: "one_off" | "automatic";
  sourcePeriodId: string | null;
  selection: PurchaseSelection;
  quotedAt: string;
  expiresAt: string;
  // First purchase / restoration starts when service actually becomes available.
  period: {
    startsAt: string | null;
    endsAt: string | null;
    anchorDay: number | null;
  };
  proration: { remainingMilliseconds: number; fullMilliseconds: number };
  lines: {
    kind: "base" | "extra_seat" | "ai_pack" | "storage_pack";
    quantity: number;
    fullSupplyKrw: number;
    fraction: { numerator: string; denominator: string };
  }[];
  amounts: {
    supplyKrw: number;
    vatKrw: number;
    totalKrw: number;
    currency: "KRW";
  };
  allowances: {
    seats: number;
    periodAiUnits: number;
    extraAiUnits: number;
    storageBytes: number;
    transferBytes: number;
  };
};
export type TeamCommerce =
  | {
      configured: false;
      checkoutReady: false;
      reason: "B2B_PRODUCT_NOT_CONFIGURED" | "B2B_PRODUCT_VERSION_CONFLICT";
    }
  | {
      configured: true;
      checkoutReady: false;
      product: TeamProduct;
      conditionsHash: string;
      currentPeriod: {
        id: string;
        startsAt: string;
        endsAt: string;
        anchorDay: number;
        extraSeats: number;
        product: TeamProduct;
      } | null;
      nextPurchased: boolean;
    };

export type TeamBuyer = {
  schemaVersion: string;
  businessName: string;
  businessRegistrationNumber: string;
  representative: string;
  address: string;
  receiptEmail: string;
};
export type CreateTeamOrder = {
  requestKey: string;
  quoteId: string;
  buyer: TeamBuyer;
};
export type TeamOrderState =
  | "awaiting_payment"
  | "payment_unknown"
  | "received"
  | "applying"
  | "applied"
  | "review_required"
  | "canceled"
  | "expired";
export type TeamOrder = {
  id: string;
  workspaceId: string;
  providerOrderId: string;
  state: TeamOrderState;
  quote: TeamQuote;
  buyer: TeamBuyer;
  expiresAt: string;
  createdAt: string;
  receipt: { amountKrw: number; approvedAt: string } | null;
  application: TeamApplication | null;
};
export type TeamApplication = {
  id: string;
  orderId: string;
  periodId: string;
  target: QuoteTarget;
  effectiveAt: string;
  appliedAt: string;
  amounts: TeamQuote["amounts"];
  allowances: TeamQuote["allowances"];
  overpaymentKrw: number;
};

export type LicenceState =
  | "active"
  | "scheduled"
  | "revoking"
  | "released"
  | "expired";
export type LicenceAssignment = {
  id: string;
  workspaceId: string;
  periodId: string;
  userId: string;
  slot: number;
  state: LicenceState;
  startsAt: string;
  endsAt: string;
  assignedBy: string;
  scheduledRevokeAt: string | null;
  revocationRequestedAt: string | null;
  reason: string;
  closedAt: string | null;
  revision: number;
  createdAt: string;
};
export type UserAiBudget = {
  workspaceId: string;
  periodId: string;
  userId: string;
  limitUnits: number;
  confirmedUnits: number;
  reservedUnits: number;
  revision: number;
};
export type LicenceOverview = {
  assignments: LicenceAssignment[];
  budgets: (UserAiBudget & { unitLabel: string; unitDescription: string })[];
  periods: {
    id: string;
    startsAt: string;
    endsAt: string;
    capacity: number;
    revision: number;
    periodAiUnits: number;
    aiUnitLabel: string;
    aiUnitDescription: string;
    state: "active" | "future" | "ended" | "revoked";
  }[];
  serverTime: string;
  deviceWaits: {
    assignmentId: string;
    deviceCount: number;
    grantCount: number;
    latestExpiry: string;
  }[];
};
export type AssignLicence = {
  requestKey: string;
  periodId: string;
  userId: string;
  limitUnits: number;
};
export type RevokeLicence = {
  requestKey: string;
  revision: number;
  reason: string;
};
export type ScheduleLicenceRevocation = RevokeLicence & {
  scheduledRevokeAt: string | null;
};
export type ChangeUserAiLimit = {
  requestKey: string;
  revision: number;
  limitUnits: number;
  reason: string;
};
export type EditingDeviceRegistration = {
  requestKey: string;
  deviceId: string;
  publicKey: string;
  signature: string;
};
export type RetireEditingDevice = {
  requestKey: string;
  revision: number;
  reason: string;
};
export type EditingDeviceOverview = {
  devices: {
    id: string;
    createdAt: string;
    state: "active" | "retiring" | "retired";
    revision: number;
    retirementRequestedAt: string | null;
    retiredAt: string | null;
    retirementReason: string;
    pendingGrantCount: number;
    latestExpiry: string | null;
  }[];
  deviceLimit: number | null;
  serverTime: string;
};
export type DeviceChallengeInput = {
  requestKey: string;
  deviceId: string;
  projectId: string;
};
export type DeviceGrantInput = DeviceChallengeInput & {
  challengeId: string;
  signature: string;
};
export type DeviceGrantAcknowledgement = {
  requestKey: string;
  deviceId: string;
  grantIds: string[];
  signature: string;
};
export type EditingGrant = {
  id: string;
  workspaceId: string;
  userId: string;
  assignmentId: string;
  assignmentRevision: number;
  deviceId: string;
  projectId: string;
  signingKeyId: string;
  issuedAt: string;
  onlineUntil: string;
  expiresAt: string;
  revocationRequestedAt: string | null;
  acknowledgedAt: string | null;
};
export type SignedEditingGrant = {
  grant: EditingGrant;
  token: string;
  publicKey: string;
  serverTime: string;
};

export type TeamAiJob = {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  periodId: string;
  quoteId: string;
  operation: "transcript" | "vision" | "agent";
  estimatedUnits: number;
  maximumUnits: number;
  confirmedUnits: number;
  state:
    | "queued"
    | "running"
    | "cancel_requested"
    | "completed"
    | "failed"
    | "cancelled"
    | "timed_out";
  acceptedAt: string;
  deadline: string;
  completedAt: string | null;
  resultVersionId: string | null;
};
export type TeamAiUsageOverview = {
  // Team aggregates are decimal strings to preserve sums beyond Number.MAX_SAFE_INTEGER.
  reconciled: boolean;
  availableUnits: string | null;
  reservedUnits: string;
  confirmedUnits: string;
  expiredUnits: string;
  personalBudgets: {
    periodId: string;
    limitUnits: number;
    reservedUnits: number;
    confirmedUnits: number;
  }[];
  serverTime: string;
};
