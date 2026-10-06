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

// Team AI quote → submission → execution → result receipt (SOT: docs/b2b-ai-execution.md).
// Clients never send units, hashes or prices; quotes are server-side and immutable.
export type TeamAiOperation = TeamAiJob["operation"];
export type TeamAiOperationCapability = {
  operation: TeamAiOperation;
  available: boolean;
  blockedReason: string | null;
  requiredStream: "audio" | "video" | null;
  maxInputs: number;
  maxInputBytes: number;
  maxDurationMs: number;
  unitSeconds: number;
  unitsPerBlock: number;
  minimumUnits: number;
  rounding: "ceil";
  languages: string[];
};
export type TeamAiCapabilities = {
  catalogVersion: string | null;
  blockedReason: string | null;
  instructionMaxLength: number;
  quoteTtlSeconds: number;
  operations: TeamAiOperationCapability[];
  serverTime: string;
};
export type CreateTeamAiQuote = {
  requestKey: string;
  operation: TeamAiOperation;
  inputVersionIds: string[];
  instruction: string;
  language?: string;
};
export type TeamAiQuoteInput = {
  ordinal: number;
  versionId: string;
  assetId: string;
  name: string;
  sha256: string;
  size: number;
  durationMs: number;
  units: number;
};
// Team balance and personal limit are separate: the personal limit only caps
// how much of the shared team balance this person may reserve.
export type TeamAiAvailability = {
  reconciled: boolean;
  teamAvailableUnits: string | null;
  personalRemainingUnits: number | null;
  unitLabel: string | null;
  unitDescription: string | null;
  submittable: boolean;
  blockedReason: string | null;
};
export type TeamAiQuote = {
  id: string;
  workspaceId: string;
  projectId: string;
  operation: TeamAiOperation;
  catalogVersion: string;
  language: string | null;
  inputs: TeamAiQuoteInput[];
  estimatedUnits: number;
  maximumUnits: number;
  createdAt: string;
  expiresAt: string;
  jobId: string | null;
  availability: TeamAiAvailability;
  serverTime: string;
};
export type TeamAiQuoteReceipt = { quote: TeamAiQuote; requestId: string };
export type SubmitTeamAiJob = {
  requestKey: string;
  quoteId: string;
  approvedMaximumUnits: number;
};
export type TeamAiResultFormat = "prepix.team-ai.result/v1";
export type TeamAiResultSummary = {
  id: string;
  jobId: string;
  format: TeamAiResultFormat;
  mediaType: "application/json";
  size: number;
  sha256: string;
  complete: boolean;
  completedStages: number;
  totalStages: number;
  units: number;
  createdAt: string;
};
export type TeamAiExecutionPhase =
  | "queued"
  | "running"
  | "needs_confirmation"
  | "finished";
export type TeamAiExecution = {
  job: TeamAiJob;
  progress: {
    phase: TeamAiExecutionPhase;
    totalStages: number;
    completedStages: number;
  };
  result: TeamAiResultSummary | null;
  serverTime: string;
};
export type TeamAiSubmission = TeamAiExecution & { requestId: string | null };
export type TeamAiResultReceipt = {
  result: TeamAiResultSummary;
  serverTime: string;
};
export type TeamAiResultContent = {
  result: TeamAiResultSummary;
  contentBase64: string;
};
// All start/end values are SECONDS from the start of the input version, with
// 0 <= start <= end <= input duration; segments (and words inside a segment)
// are in non-decreasing start order and words lie within their segment.
export type TeamAiTranscriptOutput = {
  kind: "transcript";
  provider: string;
  language: string;
  durationMs: number;
  segments: {
    start: number;
    end: number;
    text: string;
    speaker?: string;
    words?: { start: number; end: number; text: string }[];
  }[];
  fullText: string;
};
// Structured provider output, validated on the server: at least one segment,
// non-empty descriptions, same seconds bounds and ordering as transcripts.
export type TeamAiVisionOutput = {
  kind: "vision";
  provider: string;
  model: string;
  summary: string;
  segments: {
    start: number;
    end: number;
    description: string;
    tags?: string[];
  }[];
};
// The exact bytes behind TeamAiResultSummary.sha256 parse as this document.
export type TeamAiResultDocument = {
  format: TeamAiResultFormat;
  operation: TeamAiOperation;
  catalogVersion: string;
  complete: boolean;
  items: {
    ordinal: number;
    inputVersionId: string;
    inputSha256: string;
    output: TeamAiTranscriptOutput | TeamAiVisionOutput;
  }[];
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
  previewState: "not_requested" | TeamPreviewState;
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
  previewState: "not_requested" | TeamPreviewState;
  allowedActions: {
    download: boolean;
    ai: boolean;
    manage: boolean;
    unlink: boolean;
  };
};
// Review preview of one immutable video version (F10/F14). Registration
// success never implies a preview; state is reported separately and only
// `ready` can produce a playback URL. Errors: B2B_PREVIEW_UNSUPPORTED (not a
// team video version), B2B_PREVIEW_SOURCE_UNAVAILABLE (version trashed or
// purged), B2B_PREVIEW_NOT_READY, B2B_PREVIEW_NOT_FOUND (retry without a
// preview), B2B_PREVIEW_TTL_INVALID, B2B_PREVIEW_VERSION_INVALID.
export type TeamPreviewState = "pending" | "processing" | "ready" | "failed";
export type TeamPreviewFailureCode =
  | "B2B_PREVIEW_SOURCE_TOO_LARGE"
  | "B2B_PREVIEW_SOURCE_UNSUPPORTED"
  | "B2B_PREVIEW_SOURCE_TOO_LONG"
  | "B2B_PREVIEW_TRANSCODE_FAILED"
  | "B2B_PREVIEW_TIMEOUT"
  | "B2B_PREVIEW_OUTPUT_TOO_LARGE"
  | "B2B_PREVIEW_OUTPUT_INVALID"
  | "B2B_PREVIEW_ATTEMPTS_EXHAUSTED"
  | "B2B_PREVIEW_SOURCE_REMOVED";
export type TeamPreviewStatus = {
  versionId: string;
  state: TeamPreviewState;
  /** Attempts ever started; a retry keeps counting. */
  attempts: number;
  /** Set only when failed. SOURCE_* means the media, not the transcoder. */
  failureCode: TeamPreviewFailureCode | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  updatedAt: string;
};
/** Inline, Range-seekable H.264/AAC MP4. Expires within 300 s; an issued URL
 * stays usable until expiresAt even after access is revoked. */
export type TeamPreviewPlayback = { url: string; expiresAt: string };
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

// F12: verified file registration and explicit review publication are separate.
export type RegisterPublication = {
  requestKey: string;
  participationId: string;
  originWorkId: string;
  // A render/result identity; one editing work may generate several cuts.
  originResultId: string;
  originRequestId: string | null;
  basisRevision: number;
  uploadId: string;
  title: string;
  generatedAt: string;
  sha256: string;
  size: number;
  // Original basis remains fixed. A changed server project requires a new,
  // explicit choice against the revision the user just inspected.
  conflictChoice?: { mode: "new_version"; confirmedRevision: number };
};
export type PublishPublication = {
  requestKey: string;
  revision: number;
  audienceUserIds: string[];
  approverUserId: string;
};
export type TeamPublication = {
  id: string;
  workspaceId: string;
  projectId: string;
  originWorkId: string;
  originResultId: string;
  originRequestId: string | null;
  basisRevision: number;
  confirmedRevision: number;
  uploadId: string;
  versionId: string;
  title: string;
  generatedAt: string;
  registeredAt: string;
  size: number;
  sha256: string;
  metadata: TeamFileMetadata;
  previewState: "not_requested" | TeamPreviewState;
  state: "registered" | "published";
  reviewId: string | null;
  // Review changes retain this immutable result; the currently selected
  // reviewed version is independently reported here.
  currentReviewVersionId: string | null;
  publishedAt: string | null;
  allowedActions: { publish: boolean };
};
export type PublicationMutationResult = {
  requestId: string;
  publicationId: string;
  versionId: string;
  reviewId: string | null;
  projectRevision: number;
  state: "registered" | "published";
};
export type PublicationMutationLookup = {
  currentUserId: string;
  state: "not_received" | "completed";
  result: PublicationMutationResult | null;
};
export type PublicationList = {
  currentUserId: string;
  currentParticipationId: string;
  projectRevision: number;
  publications: TeamPublication[];
  nextCursor: string | null;
  latestRegisteredVersionId: string | null;
  currentReviewVersionId: string | null;
  finalApprovedVersionId: string | null;
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

// Video reviews, comments, restricted shares and one designated approver
// (F14/F15). SOT: backend/docs/b2b-reviews.md
// "not_requested": no preview row yet (same literal the file domain reports).
export type ReviewPreviewState = "not_requested" | TeamPreviewState;
export type ReviewPreview = {
  versionId: string;
  state: ReviewPreviewState;
  attempts: number;
  failureCode: TeamPreviewFailureCode | null;
  durationMs: number | null;
  updatedAt: string | null;
};
export type ReviewApprovalState =
  | "no_approver"
  | "approver_inactive"
  | "awaiting"
  | "approved"
  | "changes_requested";
export type ReviewPerson = { userId: string; name: string | null };
export type ReviewSummary = {
  id: string;
  projectId: string;
  title: string;
  round: number;
  versionId: string;
  ordinal: number;
  revision: number;
  approval: ReviewApprovalState;
  approver: ReviewPerson | null;
  previousRounds: number;
  createdAt: string;
  updatedAt: string;
};
export type ReviewList = {
  currentUserId: string;
  reviews: ReviewSummary[];
  nextCursor: string | null;
  allowedActions: { create: boolean };
};
export type ReviewRound = {
  round: number;
  versionId: string;
  ordinal: number;
  openedAt: string;
  closedAt: string | null;
  current: boolean;
  changeReason: string | null;
};
export type ReviewComment = {
  id: string;
  round: number;
  versionId: string;
  startMs: number;
  endMs: number | null;
  author: ReviewPerson;
  body: string;
  revision: number;
  history: { number: number; body: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
  // Present once converted. state/title only when the viewer can see the request.
  request: { requestId: string; state: string | null; title: string | null } | null;
  canEdit: boolean;
  canConvert: boolean;
};
export type ReviewDecision = {
  id: string;
  round: number;
  versionId: string;
  reviewRevision: number;
  decision: "approved" | "changes_requested";
  reason: string;
  approver: ReviewPerson;
  decidedAt: string;
  cancelled: { at: string; by: ReviewPerson; reason: string } | null;
  current: boolean;
};
export type ReviewApprover = {
  designationId: string;
  person: ReviewPerson;
  basis: "participant" | "share";
  active: boolean;
  assignedAt: string;
};
export type ReviewDetail = {
  currentUserId: string;
  access: "participant" | "share";
  review: {
    id: string;
    projectId: string | null;
    title: string;
    round: number;
    versionId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    audienceConfirmed: boolean;
  };
  rounds: ReviewRound[];
  selectedRound: number;
  preview: ReviewPreview;
  approver: ReviewApprover | null;
  /** Selected current-round project participants; withheld from share viewers. */
  audience: ReviewAudiencePerson[] | null;
  approval: ReviewApprovalState;
  decisions: ReviewDecision[];
  comments: ReviewComment[];
  share: { id: string; expiresAt: string; allowDownload: boolean } | null;
  allowedActions: {
    comment: boolean;
    decide: boolean;
    cancelDecision: boolean;
    setApprover: boolean;
    replaceVersion: boolean;
    share: boolean;
    retryPreview: boolean;
    download: boolean;
    setAudience: boolean;
  };
};
export type ReviewPlayback = TeamPreviewPlayback;
export type ReviewAudiencePerson = ReviewPerson & {
  role: "lead" | "producer" | "reviewer";
};
export type ReviewAudienceCandidates = {
  currentUserId: string;
  candidates: { userId: string; label: string; role: "lead" | "producer" | "reviewer" }[];
};
export type ConfirmReviewAudience = {
  audienceUserIds: string[];
  approverUserId: string;
};
export type CreateReview = Mutation & ConfirmReviewAudience & { title: string; versionId: string };
export type ReplaceReviewVersion = RevisionMutation & ConfirmReviewAudience & { versionId: string; reason: string };
export type SetReviewAudience = RevisionMutation & ConfirmReviewAudience & { reason: string };
export type SetReviewApprover = RevisionMutation & {
  userId: string | null;
  reason: string;
};
export type DecideReview = RevisionMutation & {
  round: number;
  versionId: string;
  decision: "approved" | "changes_requested";
  reason: string;
};
export type CancelReviewDecision = RevisionMutation & { reason: string };
export type CreateReviewComment = Mutation & {
  round: number;
  versionId: string;
  startMs: number;
  endMs: number | null;
  body: string;
};
export type EditReviewComment = RevisionMutation & { body: string };
// `revision` pins the exact comment text the converter saw.
export type ConvertReviewComment = Mutation & {
  revision: number;
  title: string;
};
export type CreateReviewShare = Mutation & {
  round: number;
  versionId: string;
  recipients: string[];
  // Omitted: DB time + 7 days.
  expiresAt?: string;
  allowDownload: boolean;
};
export type RevokeReviewShare = Mutation & { reason: string };
export type ReviewShare = {
  id: string;
  round: number;
  versionId: string;
  ordinal: number;
  recipients: { email: string; ended: boolean }[];
  expiresAt: string;
  allowDownload: boolean;
  createdBy: ReviewPerson;
  createdAt: string;
  revoked: { at: string; by: ReviewPerson; reason: string } | null;
  state: "active" | "expired" | "revoked";
};
export type ReviewShareList = { currentUserId: string; shares: ReviewShare[]; customExpiryMaxDays: number | null };
// The token is shown once on creation and reconstructed for the lead on
// request; it is never part of a stored receipt, audit row or list.
export type ReviewShareLink = {
  shareId: string;
  token: string;
  expiresAt: string;
};
export type ReviewApproverCandidate = {
  userId: string;
  label: string;
  basis: "participant" | "share";
};
export type ReviewApproverCandidates = {
  currentUserId: string;
  candidates: ReviewApproverCandidate[];
};
export type ReviewDownload = {
  url: string;
  expiresIn: number;
  size: number;
  sha256: string;
};
export type ReviewMutationAction =
  | "create"
  | "round"
  | "approver"
  | "audience"
  | "decide"
  | "cancel"
  | "comment"
  | "edit"
  | "convert"
  | "share"
  | "revoke";
export type ReviewMutationResult = {
  requestId: string;
  review: { id: string; revision: number; round: number };
  commentId?: string;
  commentRevision?: number;
  decisionId?: string;
  designationId?: string | null;
  shareId?: string;
  projectRequestId?: string;
};
export type ReviewMutationLookup = {
  currentUserId: string;
  receipt: ReviewMutationResult | null;
};
export type ReviewWorkQuery = {
  view?: "all" | "approvals" | "changes";
  search?: string;
  cursor?: string;
};
export type ReviewWorkList = {
  currentUserId: string;
  workspaceId: string;
  projectId: string | null;
  asOf: string;
  teamState: string;
  revision: string;
  counts: {
    approvals: number;
    awaiting: number;
    changes: number;
    unassigned: number;
  };
  cards: {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    round: number;
    approval: ReviewApprovalState;
    myApproval: boolean;
    updatedAt: string;
  }[];
  nextCursor: string | null;
};
// Read by the delivery domain (F16) inside its own team-locked transaction.
export type ReviewApprovalEvidence = {
  approved: boolean;
  approvals: {
    reviewId: string;
    round: number;
    reviewRevision: number;
    versionId: string;
    decisionId: string;
    approverId: string;
    designationId: string;
    decidedAt: string;
    retentionId: string;
  }[];
};

// F16 delivery and completion. Paths/URLs never identify delivered bytes.
export type DeliveryMediaIdentity = Pick<TeamNativeSource,
  "kind" | "durationTicks" | "width" | "height" | "frameRate" | "audioChannels">;
export type DeliveryItem = {
  itemId: string; role: "editing_project" | "source" | "result";
  location: "cloud" | "external"; versionId: string | null;
  name: string; size: number; sha256: string; media?: DeliveryMediaIdentity;
};
export type DeliveryOpenedItem = Pick<DeliveryItem, "itemId" | "size" | "sha256" | "media">;
export type DeliveryReconfirm = { video: boolean; delivery: boolean; requestIds: string[] };
export type CreateDeliveryPackage = {
  requestKey: string; revision: number; videoVersionId: string; items: DeliveryItem[];
  recipientIds: string[]; deviceId: string; environmentId: string; localCopyId: string;
};
export type ConfirmDeliveryPackage = {
  requestKey: string; revision: number; manifestHash: string;
  sourceKind: "native_app_verified" | "external_tool_attestation";
  tool: string; toolVersion: string; deviceId: string; environmentId: string;
  localCopyId: string; openedAt: string; openedItems: DeliveryOpenedItem[];
};
export type DeliveryMutationResult = {
  requestId: string; currentUserId: string; workspaceId: string; projectId: string; revision: number;
  packageId?: string; receiptId?: string; snapshotId?: string; reopenId?: string;
  state?: ProjectState;
};
export type ProjectCompletionSnapshot = {
  videoVersionId: string; approval: ReviewApprovalEvidence; requests: ProjectRequestCompletionEvidence;
  completionRuleRevision: number; requiresWorkingFiles: boolean;
  delivery: { packageId: string; manifestHash: string; items: DeliveryItem[];
    receipts: { receiptId: string; userId: string; participationId: string; openedAt: string;
      sourceKind: "native_app_verified" | "external_tool_attestation" }[] } | null;
  retainedVersionIds: string[];
};
export type DeliveryPackageView = {
  id: string; workspaceId: string; projectId: string; videoVersionId: string; producerId: string;
  ruleRevision: number; policyVersion: string; deviceId: string; environmentId: string; localCopyId: string;
  manifestHash: string; items: DeliveryItem[]; recipients: { userId: string }[]; createdAt: string;
};
export type DeliveryOpenReceiptView = {
  id: string; workspaceId: string; projectId: string; packageId: string; userId: string; manifestHash: string;
  sourceKind: "native_app_verified" | "external_tool_attestation"; tool: string; toolVersion: string;
  deviceId: string; environmentId: string; localCopyId: string; openedItems: DeliveryOpenedItem[];
  openedAt: string; receivedAt: string;
};
export type DeliveryDetail = {
  currentUserId: string; workspaceId: string; projectId: string; revision: number; state: ProjectState;
  requiresWorkingFiles: boolean; package: DeliveryPackageView | null; receipts: DeliveryOpenReceiptView[];
  invalidations: { id: string; workspaceId: string; projectId: string; packageId: string; receiptId: string | null; actorId: string; reason: string; createdAt: string }[];
  snapshots: { id: string; workspaceId: string; projectId: string; projectRevision: number; completedBy: string; createdAt: string; evidence: ProjectCompletionSnapshot | null }[];
  reopens: { id: string; workspaceId: string; projectId: string; snapshotId: string; actorId: string; reason: string; reconfirm: DeliveryReconfirm; projectRevision: number; createdAt: string }[];
  allowedActions: { propose: boolean; confirm: boolean; withdraw: boolean; complete: boolean; reopen: boolean; archive: boolean; unarchive: boolean };
  serverTime: string;
};
export type DeliveryCondition<T> = { satisfied: boolean; code: string | null; evidence: T | null };
export type DeliveryCheck = {
  currentUserId: string; workspaceId: string; projectId: string; revision: number; satisfied: boolean; code: string | null;
  conditions: { approval: DeliveryCondition<ReviewApprovalEvidence>; requests: DeliveryCondition<ProjectRequestCompletionEvidence>;
    delivery: DeliveryCondition<ProjectCompletionSnapshot["delivery"]> & { required: boolean } };
  evidence: ProjectCompletionSnapshot | null;
};
export type DeliveryReceiptLookup = {
  currentUserId: string; workspaceId: string; projectId: string; action: string; requestKey: string;
  inputHash: string; receipt: DeliveryMutationResult;
};
