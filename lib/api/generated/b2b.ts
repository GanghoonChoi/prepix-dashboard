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
  reservedUnits: number;
  returnedUnits: number;
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
export type TeamAiJobList = {
  jobs: (TeamAiJob & { projectName: string })[];
  nextCursor: string | null;
  serverTime: string;
};
export type TeamAiUsageOverview = {
  // Team aggregates are decimal strings to preserve sums beyond Number.MAX_SAFE_INTEGER.
  reconciled: boolean;
  availableUnits: string | null;
  reservedUnits: string;
  confirmedUnits: string;
  expiredUnits: string;
  returnedUnits: string;
  personalBudgets: {
    periodId: string;
    startsAt: string;
    endsAt: string;
    unitLabel: string;
    unitDescription: string;
    limitUnits: number;
    reservedUnits: number;
    confirmedUnits: number;
  }[];
  serverTime: string;
};

export type TeamFileKind = "original" | "output" | "working";
export type TeamFileUploadState =
  | "preparing"
  | "uploading"
  | "verifying"
  | "ready"
  | "cancelled"
  | "expired"
  | "quarantined";
/** One self-contained UTF-8 edit document; source bytes stay external. */
export type TeamNativeSource = {
  mediaId: string;
  name: string;
  kind: "video" | "audio" | "image";
  size: number;
  sha256: string;
  durationTicks: number;
  width: number;
  height: number;
  frameRate: number;
  audioChannels: number;
};
export type TeamNativeProject = {
  format: "prepix-team-project";
  formatVersion: 1;
  createdAt: string;
  document: Record<string, unknown>;
  sources: TeamNativeSource[];
};
export type TeamNativePolicy = {
  formatVersion: 1;
  maxBytes: number;
  maxSources: number;
};
export type TeamFileMetadata = {
  native?: { formatVersion: 1; documentVersion: 4; sourceCount: number };
  container: string;
  durationMs: number | null;
  video: {
    codec: string;
    width: number;
    height: number;
    frameRateNumerator: number;
    frameRateDenominator: number;
  }[];
  audio: { codec: string; sampleRate: number; channels: number }[];
};
export type TeamFilePolicy = {
  /** Absent means native upload is unavailable, not unlimited. */
  native?: TeamNativePolicy;
  version: string;
  maxFileBytes: number;
  formats: string[];
  inspectionTimeoutSeconds: number;
};
export type TeamFileCapabilities = {
  currentUserId: string;
  uploadsEnabled: boolean;
  policy: TeamFilePolicy | null;
  partSize: number;
  storage: { usedBytes: string; reservedBytes: string; limitBytes: string };
  serverTime: string;
};
export type TeamFileUpload = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  assetId: string;
  versionId: string;
  name: string;
  kind: TeamFileKind;
  size: number;
  sha256: string;
  state: TeamFileUploadState;
  failure: string | null;
  lastActivityAt: string;
  idleExpiresAt: string;
  cleanedAt: string | null;
  partSize: number;
  previewState: "not_requested";
};
export type TeamFileUploadStatus = {
  upload: TeamFileUpload;
  parts: { number: number; size: number; etag: string; checksum?: string }[];
  needsCompletion: boolean;
};
export type TeamFilePartTicket = {
  url: string;
  headers: Record<string, string>;
  expiresIn: number;
};
export type TeamFileUploadCompletion = { upload: TeamFileUpload };
export type TeamFileUploadCancelReceipt = {
  projectId: string | null;
  uploadId: string | null;
  cancelled: true;
  requestId: string;
};
export type TeamFileUploadLookup = {
  currentUserId: string;
  upload: TeamFileUpload | null;
  cancelled: boolean;
};
export type BeginTeamFileUploadInput = {
  requestKey: string;
  name: string;
  kind: TeamFileKind;
  size: number;
  sha256: string;
  existingAssetId?: string;
  scope: "uploader_and_steward";
};
export type TeamFileVersion = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  assetId: string;
  name: string;
  assetName: string;
  kind: TeamFileKind;
  ordinal: number;
  assetRevision: number;
  referenceRevision: number | null;
  permissionRevision: number;
  size: number;
  sha256: string;
  metadata: TeamFileMetadata;
  createdAt: string;
  previewState: "not_requested";
  allowedActions: {
    download: boolean;
    ai: boolean;
    manage: boolean;
    unlink: boolean;
  };
};
export type TeamFileVersionList = {
  versions: TeamFileVersion[];
  nextCursor: string | null;
};
export type TeamLibraryEntry = {
  version: TeamFileVersion;
  linked: boolean;
  canLink: boolean;
  locations: { projectId: string; name: string }[];
};
export type TeamLibraryList = {
  currentUserId: string;
  entries: TeamLibraryEntry[];
  nextCursor: string | null;
};
export type TeamFilePermissionList = {
  stewardId: string;
  permissions: {
    userId: string;
    canDownload: boolean;
    canUseForAi: boolean;
    revokedAt: string | null;
    revision: number;
  }[];
};
export type TeamFileMutationAction = "permission" | "link" | "unlink";
export type TeamFileMutationLookup = {
  currentUserId: string;
  receipt: { requestId: string; revision: number } | null;
};
export type ChangeTeamFilePermissionInput = {
  requestKey: string;
  revision: number;
  userId: string;
  canDownload: boolean;
  canUseForAi: boolean;
  remove?: boolean;
  reason: string;
};
export type TeamFileDownload = {
  url: string;
  expiresIn: number;
  size: number;
  sha256: string;
};
export type TeamFileStewardInput = {
  requestKey: string;
  versionId: string;
  revision: number;
  targetId: string;
  reason: string;
  canDownload: boolean;
};
export type TransferTeamFileStewardInput = TeamFileStewardInput & {
  sourceProjectId?: string;
  fromLibrary: boolean;
};
export type TeamFileStewardCause =
  | "member_removed"
  | "membership_suspended"
  | "account_suspended"
  | "account_purged";
export type TeamFileStewardLookup = {
  currentUserId: string;
  versionId: string;
  revision: number;
  cause?: TeamFileStewardCause;
  eligiblePeople: { userId: string; name: string | null; email: string }[];
};
export type TeamFileStewardReceipt = {
  currentUserId: string;
  requestId: string;
  revision: number;
  recoveryId?: string;
};
export type TeamFileStewardOperation =
  | "transfer"
  | "request"
  | "accept"
  | "cancel";
export type TeamFileStewardRecovery = {
  id: string;
  versionId: string;
  reason: string;
  cause: TeamFileStewardCause;
  canDownload: boolean;
  incoming: boolean;
  state: "pending" | "expired" | "accepted" | "cancelled";
  expiresAt: string;
};
export type TeamFileStewardRecoveryList = {
  currentUserId: string;
  recoveries: TeamFileStewardRecovery[];
  nextCursor: string | null;
};
export type TeamFileTrashInput = {
  requestKey: string;
  versionId: string;
  revision: number;
  reason: string;
  sourceProjectId?: string;
  fromLibrary: boolean;
};
export type RestoreTeamFileTrashInput = Omit<TeamFileTrashInput, "versionId">;
export type PurgeTeamFileTrashInput = {
  requestKey: string;
  revision: number;
  reason: string;
  confirmIrreversible: true;
};
export type TeamFileTrashReceipt = {
  currentUserId: string;
  requestId: string;
  trashId: string;
  versionId: string;
  revision: number;
  state: "trashed" | "restored" | "purge_requested";
};
export type TeamFileTrashEntry = {
  id: string;
  revision: number;
  version: TeamFileVersion;
  trashedAt: string;
  restoreUntil: string;
  state: "recoverable" | "expired" | "purge_requested";
  allowedActions: { restore: boolean; purge: boolean };
};
export type TeamFileTrashList = {
  currentUserId: string;
  entries: TeamFileTrashEntry[];
  nextCursor: string | null;
};
export type TeamFileTrashImpact = {
  currentUserId: string;
  trashId: string;
  versionId: string;
  revision: number;
  restoreUntil: string;
};

// F13 project requests. Submissions pin exact immutable file versions; a
// restricted file carries no name or identifier. Confirmations are history:
// only `current` ones satisfy completion.
export type ProjectRequestState =
  | "proposed"
  | "open"
  | "submitted"
  | "confirmed"
  | "waived"
  | "cancelled"
  | "declined";
export type ProjectRequestPerson = { userId: string; name: string | null };
export type ProjectRequest = {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  state: ProjectRequestState;
  required: boolean;
  shared: boolean;
  assignmentCurrent: { assignee: boolean; confirmer: boolean };
  assignee: ProjectRequestPerson | null;
  confirmer: ProjectRequestPerson | null;
  createdBy: ProjectRequestPerson;
  dueAt: string | null;
  requestRevision: number;
  submissionCount: number;
  evidenceMissing: boolean;
  resolution: {
    reason: string;
    by: ProjectRequestPerson;
    at: string;
  } | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  allowedActions: {
    update: boolean;
    accept: boolean;
    close: boolean;
    reopen: boolean;
    submit: boolean;
    decide: boolean;
  };
};
export type ProjectRequestList = {
  currentUserId: string;
  nextCursor: string | null;
  requests: ProjectRequest[];
  // Counts visible required requests only; satisfied = confirmed or waived.
  required: { total: number; satisfied: number };
  allowedActions: { create: boolean; propose: boolean };
};
export type RequestWorkQuery = {
  view?: "all" | "assigned" | "confirming" | "proposals" | "overdue";
  search?: string;
  cursor?: string;
};
export type RequestWorkList = {
  currentUserId: string;
  workspaceId: string;
  projectId: string | null;
  asOf: string;
  teamState: TeamState;
  // Digest of this currently authorized response, not a team-wide revision.
  revision: string;
  counts: { assigned: number; confirming: number; proposals: number; overdue: number };
  required: { total: number; satisfied: number };
  cards: {
    id: string; projectId: string; projectName: string; projectState: ProjectState;
    title: string; state: ProjectRequestState; required: boolean; dueAt: string | null;
    revision: number; requestRevision: number;
    work: "assigned" | "confirming" | "proposal";
    overdue: boolean; canAct: boolean;
  }[];
  nextCursor: string | null;
};
export type ProjectRequestRevision = {
  number: number;
  references: ProjectRequestReferenceFile[];
  body: string;
  criteria: string;
  format: string;
  required: boolean;
  createdBy: ProjectRequestPerson;
  createdAt: string;
};
export type ProjectRequestSubmissionFile =
  | {
      position: number;
      access: "available";
      versionId: string;
      assetId: string;
      name: string;
      ordinal: number;
      size: number;
      sha256: string;
    }
  | { position: number; access: "restricted" };
export type ProjectRequestReferenceFile =
  | (Extract<ProjectRequestSubmissionFile, { access: "available" }> & {
      canDownload: boolean;
    })
  | Extract<ProjectRequestSubmissionFile, { access: "restricted" }>;
export type ProjectRequestConfirmation = {
  id: string;
  decision: "confirmed" | "returned";
  note: string;
  confirmer: ProjectRequestPerson;
  selfConfirmed: boolean;
  externalOpened: boolean;
  current: boolean;
  createdAt: string;
};
export type ProjectRequestSubmission = {
  id: string;
  number: number;
  requestRevision: number;
  submittedBy: ProjectRequestPerson;
  note: string;
  external: { location: string; files: string[] } | null;
  files: ProjectRequestSubmissionFile[];
  confirmation: ProjectRequestConfirmation | null;
  createdAt: string;
};
export type ProjectRequestDetail = {
  currentUserId: string;
  request: ProjectRequest;
  revisions: ProjectRequestRevision[];
  submissions: ProjectRequestSubmission[];
};
export type ProjectRequestFields = {
  // Omission preserves references on update; [] explicitly removes them.
  referenceVersionIds?: string[];
  title: string;
  body: string;
  criteria?: string;
  format?: string;
  required?: boolean;
  confirmerId?: string | null;
  assigneeId?: string | null;
  dueAt?: string | null;
  shared?: boolean;
};
export type CreateProjectRequest = Mutation & ProjectRequestFields;
export type UpdateProjectRequest = RevisionMutation &
  ProjectRequestFields & {
    /** Explicitly bind the same person to their current participation. */
    reassignAssignee?: boolean;
    reassignConfirmer?: boolean;
  };
export type CloseProjectRequest = RevisionMutation & { reason: string };
export type ReopenProjectRequest = CloseProjectRequest;
export type SubmitProjectRequest = Mutation & {
  requestRevision: number;
  versionIds: string[];
  note: string;
  externalLocation?: string;
  externalFiles?: string[];
};
export type DecideProjectRequestSubmission = Mutation & {
  decision: "confirmed" | "returned";
  note: string;
  externalOpened?: boolean;
};
export type ProjectRequestMutationResult = {
  request: { id: string; state: ProjectRequestState; revision: number };
  submissionId?: string;
  confirmationId?: string;
  requestId: string;
};
// Read by the delivery domain (F16) inside its own team-locked transaction.
export type ProjectRequestCompletionEvidence = {
  satisfied: boolean;
  requests: {
    requestId: string;
    requestRevisionNumber: number;
    state: "open" | "submitted" | "confirmed" | "waived";
    submissionId: string | null;
    confirmationId: string | null;
    code: "B2B_REQUEST_EVIDENCE_MISSING" | null;
    waiver: { reason: string; by: string; at: string } | null;
  }[];
};

export type ProjectRequestMutationAction =
  | "create"
  | "update"
  | "accept"
  | "close"
  | "reopen"
  | "submit"
  | "decide";
export type ProjectRequestMutationLookup = {
  currentUserId: string;
  receipt: ProjectRequestMutationResult | null;
};

// F18/P14 monthly statement (월 이용명세서). Not a tax invoice. Money is KRW from
// the original order copy; AI figures are units recorded against prepaid grants
// and never added to a charge. SOT: backend/docs/b2b-monthly-statements.md
export type StatementReason =
  | "initial"
  | "late_receipt"
  | "application_recorded"
  | "status_changed"
  | "correction_recorded"
  | "usage_recorded"
  | "content_changed";
export type TeamStatementPurchase = {
  orderId: string;
  target: QuoteTarget;
  productVersion: string;
  paidAt: string;
  status: "applied" | "awaiting_application" | "review_required";
  period: TeamQuote["period"];
  lines: TeamQuote["lines"];
  amounts: TeamQuote["amounts"];
  receivedKrw: number;
  application: {
    appliedAt: string;
    effectiveAt: string;
    amounts: TeamQuote["amounts"];
    overpaymentKrw: number;
  } | null;
};
// Delayed-application overpayment debt on the original payment (information;
// the money returned is only ever counted from a confirmed refund).
export type TeamStatementAdjustment = {
  orderId: string;
  amountKrw: number;
  state: "pending" | "confirming" | "unknown" | "refunded" | "review_required";
  recordedAt: string;
  refundedAt: string | null;
};
// A refund requested in, or confirmed in, the month. Only `returnedInMonthKrw`
// (provider-confirmed money corrections dated in this month) is money returned;
// reserved/cancelling/provider_unknown are "being confirmed", never refunded.
export type TeamStatementRefund = {
  refundId: string;
  orderId: string;
  orderPaidAt: string;
  kind: "unused" | "overpayment";
  state:
    | "reserved"
    | "cancelling"
    | "provider_unknown"
    | "refunded"
    | "rejected"
    | "failed"
    | "review_required";
  amounts: { supplyKrw: number; vatKrw: number; totalKrw: number };
  allowances: { seats: number; storageBytes: number; aiUnits: number };
  requestedAt: string;
  refundedAt: string | null;
  returnedInMonthKrw: number;
};
export type TeamStatementAiUnit = {
  unitLabel: string;
  unitDescription: string;
  // Decimal strings: sums may exceed Number.MAX_SAFE_INTEGER.
  grantedBasic: string;
  grantedExtra: string;
  reserved: string;
  confirmed: string;
  returned: string;
  expired: string;
  // Refund withholding (E1 0064): revoked never spendable; reinstated returns
  // it after a rejected/failed refund (an expired grant re-expires at once).
  revoked: string;
  reinstated: string;
  grants: {
    kind: "basic" | "extra";
    units: number;
    startsAt: string;
    expiresAt: string;
  }[];
};
export type TeamStatementSnapshot = {
  schemaVersion: 1;
  // Bumped whenever how a figure is computed changes. A stored revision with
  // another version is never auto-corrected; it goes to ops review instead.
  calculationVersion: number;
  document: "monthly_statement";
  workspaceId: string;
  teamName: string;
  month: string;
  range: { startsAt: string; endsAt: string };
  // Latest business copy paid up to month end (the only recipient of a month
  // without purchases). `recipients` lists the copies of this month's own
  // purchases, one entry per distinct copy, so a mid-month profile change
  // shows as two recipients.
  recipient: (TeamBuyer & { sourceOrderId: string }) | null;
  recipients: { buyer: TeamBuyer; sourceOrderIds: string[] }[];
  purchases: TeamStatementPurchase[];
  totals: {
    supplyKrw: number;
    vatKrw: number;
    totalKrw: number;
    receivedKrw: number;
    // Provider-confirmed refunds dated in this month, any original month.
    refundedKrw: number;
  };
  byKind: {
    kind: TeamQuote["lines"][number]["kind"];
    quantity: number;
    listSupplyKrw: number;
  }[];
  adjustments: TeamStatementAdjustment[];
  refunds: TeamStatementRefund[];
  ai: TeamStatementAiUnit[];
};
export type TeamStatementRevisionSummary = {
  id: string;
  month: string;
  revision: number;
  previousId: string | null;
  reasons: StatementReason[];
  issuedAt: string;
  issueOn: string;
  calendarVersion: string;
  snapshotHash: string;
  pdf: { sha256: string; bytes: number };
};
export type TeamStatementRevision = TeamStatementRevisionSummary & {
  snapshot: TeamStatementSnapshot;
};
export type TeamStatementMonthState =
  | "collecting"
  | "scheduled"
  | "due"
  | "blocked"
  | "issued";
export type TeamStatementMonth = {
  month: string;
  state: TeamStatementMonthState;
  issueOn: string | null;
  latest: TeamStatementRevisionSummary | null;
  revisions: number;
};
export type TeamStatementCalendarStatus =
  | { configured: true; version: string; issueBusinessDay: number }
  | { configured: false; reason: "B2B_STATEMENT_CALENDAR_MISSING" };
export type TeamStatementList = {
  calendar: TeamStatementCalendarStatus;
  taxInvoice: { available: false; reason: "B2B_TAX_INVOICE_NOT_CONFIGURED" };
  months: TeamStatementMonth[];
  serverTime: string;
};
export type TeamStatementDetail = {
  month: string;
  state: TeamStatementMonthState;
  issueOn: string | null;
  revisions: TeamStatementRevision[];
  serverTime: string;
};
export type IssueTeamStatement = { requestKey: string };
export type TeamStatementIssueResult = {
  month: string;
  revision: TeamStatementRevisionSummary;
  created: boolean;
};

// One display mapping for statement labels, shared by the PDF and the web
// screen (the dashboard copies this file). `ko` is what the PDF prints.
type Label = { ko: string; en: string };
export const statementLabels = {
  kinds: {
    base: { ko: "기본 팀 상품", en: "Base team product" },
    extra_seat: { ko: "추가 편집 이용권", en: "Extra editing licence" },
    ai_pack: { ko: "추가 AI", en: "AI pack" },
    storage_pack: { ko: "저장 추가", en: "Storage pack" },
  } satisfies Record<TeamQuote["lines"][number]["kind"], Label>,
  targets: {
    initial: { ko: "첫 구매", en: "First purchase" },
    current: { ko: "현재 기간 추가", en: "Current-period add-on" },
    next: { ko: "다음 기간 선구매", en: "Next-period prepurchase" },
    restore: { ko: "종료 후 복구", en: "Restoration" },
  } satisfies Record<QuoteTarget, Label>,
  purchaseStates: {
    applied: { ko: "반영 완료", en: "Applied" },
    awaiting_application: {
      ko: "수납 완료 · 반영 대기",
      en: "Paid · awaiting application",
    },
    review_required: { ko: "운영 확인 중", en: "Under review" },
  } satisfies Record<TeamStatementPurchase["status"], Label>,
  adjustmentStates: {
    pending: { ko: "반환 대기", en: "Return pending" },
    confirming: { ko: "반환 확인 중", en: "Return being confirmed" },
    unknown: { ko: "반환 확인 중", en: "Return being confirmed" },
    refunded: { ko: "반환 완료", en: "Returned" },
    review_required: { ko: "운영 확인 중", en: "Under review" },
  } satisfies Record<TeamStatementAdjustment["state"], Label>,
  // Only "refunded" reads as money returned; in-flight states never do.
  refundStates: {
    reserved: { ko: "환불 확인 중", en: "Refund being confirmed" },
    cancelling: { ko: "환불 확인 중", en: "Refund being confirmed" },
    provider_unknown: { ko: "환불 확인 중", en: "Refund being confirmed" },
    refunded: { ko: "환불 완료", en: "Refunded" },
    rejected: { ko: "환불 거절", en: "Refund rejected" },
    failed: { ko: "환불 실패", en: "Refund failed" },
    review_required: { ko: "운영 확인 중", en: "Under review" },
  } satisfies Record<TeamStatementRefund["state"], Label>,
  reasons: {
    initial: { ko: "최초 발행", en: "First issue" },
    late_receipt: { ko: "늦게 확인된 수납 반영", en: "Late payment receipt" },
    application_recorded: {
      ko: "이용권·제공량 반영 결과 확정",
      en: "Application recorded",
    },
    status_changed: { ko: "수납 처리 상태 변경", en: "Payment status changed" },
    correction_recorded: {
      ko: "과납·환불 정정 기록 반영",
      en: "Overpayment or refund changed",
    },
    usage_recorded: { ko: "AI 원장 기록 변경", en: "AI ledger changed" },
    content_changed: { ko: "집계 내용 정정", en: "Content corrected" },
  } satisfies Record<StatementReason, Label>,
};
