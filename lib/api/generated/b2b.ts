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
      checkoutReady: boolean;
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
  kind: "checkout" | "billing";
  // Documented provider refusal code only; never the provider message.
  failureCode: string | null;
  refunds: TeamRefund[];
  // The purchased period this order was applied to (exclusive E).
  appliedPeriod: { startsAt: string; endsAt: string } | null;
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

// Original-order refunds and append-only corrections. Statements read these;
// only `refunded` refunds and `money`/`confirm` corrections are money returned.
// SOT: backend/docs/b2b-billing-execution.md §8-9
export type TeamRefundState =
  | "reserved"
  | "cancelling"
  | "provider_unknown"
  | "refunded"
  | "rejected"
  | "failed"
  | "review_required";
export type TeamRefundSelection = {
  base: boolean;
  extraSeats: number;
  aiPacks: number;
  storagePacks: number;
};
export type TeamRefundLine = {
  kind: "base" | "extra_seat" | "ai_pack" | "storage_pack" | "overpayment";
  quantity: number;
  // Exact unrounded supply; the refund total is rounded once.
  supply: { numerator: string; denominator: string };
  seats: number;
  storageBytes: number;
  aiUnits: number;
};
export type TeamRefund = {
  id: string;
  workspaceId: string;
  orderId: string;
  kind: "unused" | "overpayment";
  state: TeamRefundState;
  refundPolicyVersion: string | null;
  settingsVersion: string;
  selection: TeamRefundSelection | null;
  // PostgreSQL instant the unused portion was measured and reserved.
  basisAt: string;
  amounts: {
    supplyKrw: number;
    vatKrw: number;
    totalKrw: number;
    currency: "KRW";
  };
  allowances: { seats: number; storageBytes: number; aiUnits: number };
  lines: TeamRefundLine[];
  reason: string;
  requestedAt: string;
  decidedAt: string | null;
  refundedAt: string | null;
};
export type BillingCorrection = {
  id: string;
  workspaceId: string;
  refundId: string;
  orderId: string;
  periodId: string | null;
  grantId: string | null;
  kind: "seats" | "storage_bytes" | "ai_units" | "money";
  // hold/release: refund reservation of an allowance; confirm: money refunded.
  effect: "hold" | "release" | "confirm";
  // Signed integer as a decimal string (KRW, seats, bytes or AI units).
  delta: string;
  reason: string;
  createdAt: string;
};
export type CreateTeamRefund = {
  requestKey: string;
  orderId: string;
  selection: TeamRefundSelection;
  reason: string;
  expectedTotalKrw: number;
  // The preview's `basisAt`: the amount is measured at that instant (at most
  // ten minutes old) so seconds of drift never void the request.
  basisAt?: string;
};
// Team billing settings, payment methods and renewal (S21-S24).
// SOT: backend/docs/b2b-billing-execution.md §1-7
export type TeamClientCheckout = {
  mode: "toss" | "local_double";
  clientKey: string;
  environment: "test" | "live";
  doubleCheckoutUrl: string | null;
};
export type TeamBillingReadiness = {
  settingsVersion: string | null;
  profileSchemaVersion: string | null;
  autoPayConsentVersion: string | null;
  checkout: boolean;
  billing: boolean;
  autoPay: boolean;
  refunds: boolean;
  overpayment: boolean;
  // Setting names that block an action. Never interpreted as free/unlimited.
  missing: string[];
};
export type TeamBillingProfile = TeamBuyer & {
  revision: number;
  updatedAt: string;
};
export type ChangeTeamBillingProfile = TeamBuyer & {
  requestKey: string;
  // null creates the first profile.
  revision: number | null;
};
export type TeamPaymentMethodState =
  | "pending"
  | "issuing"
  | "active"
  | "replaced"
  | "deleted"
  | "failed"
  | "unknown";
export type TeamPaymentMethod = {
  id: string;
  state: TeamPaymentMethodState;
  environment: "test" | "live";
  method: string | null;
  cardNumberMasked: string | null;
  cardIssuerCode: string | null;
  consentVersion: string;
  consentedAt: string;
  registeredByCurrentUser: boolean;
  expiresAt: string;
  activatedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  revision: number;
};
export type StartPaymentMethodRegistration = {
  requestKey: string;
  consentVersion: string;
};
export type PaymentMethodRegistration = {
  method: TeamPaymentMethod;
  customerKey: string;
  checkout: TeamClientCheckout;
};
export type CompletePaymentMethodRegistration = {
  requestKey: string;
  customerKey: string;
  authKey: string;
};
export type RemovePaymentMethod = {
  requestKey: string;
  revision: number;
  reason: string;
};
export type TeamRenewalPlan = {
  mode: "one_off" | "automatic";
  methodId: string | null;
  // null: next-period capacity not specified; never auto-purchased.
  extraSeats: number | null;
  aiPacks: number;
  storagePacks: number;
  retainedUserIds: string[];
  consentedProductVersion: string | null;
  consentVersion: string | null;
  pausedReason: string | null;
  revision: number;
  updatedAt: string | null;
  // Automatic mode only: when the first automatic charge can happen. Consent
  // given inside the charge lead window skips the upcoming period
  // (`upcomingSkipped`) and starts with the following one.
  firstChargeAt: string | null;
  upcomingSkipped: boolean;
};
export type ChangeTeamRenewalPlan = {
  requestKey: string;
  revision: number;
  mode: "one_off" | "automatic";
  methodId: string | null;
  extraSeats: number | null;
  aiPacks: number;
  storagePacks: number;
  retainedUserIds: string[];
  // Required to switch to automatic: the consent text and product shown.
  consentVersion?: string;
  productVersion?: string;
};
export type TeamAutopayRunState =
  | "scheduled"
  | "charging"
  | "paid"
  | "failed"
  | "skipped"
  | "stopped";
export type TeamAutopayRun = {
  id: string;
  sourcePeriodId: string;
  state: TeamAutopayRunState;
  attempts: number;
  nextAttemptAt: string | null;
  lastOrderId: string | null;
  stopReason: string | null;
  updatedAt: string;
};
export type TeamBilling = {
  currentUserId: string;
  readiness: TeamBillingReadiness;
  profile: TeamBillingProfile | null;
  methods: TeamPaymentMethod[];
  renewal: TeamRenewalPlan;
  runs: TeamAutopayRun[];
  // Only for owners/administrators who can choose retained licence holders.
  retainedCandidates: { userId: string; name: string | null; email: string }[] | null;
  serverTime: string;
};
export type TeamOrderSummary = {
  id: string;
  providerOrderId: string;
  kind: "checkout" | "billing";
  state: TeamOrderState;
  target: QuoteTarget;
  renewal: "one_off" | "automatic";
  amounts: TeamQuote["amounts"];
  period: TeamQuote["period"];
  failureCode: string | null;
  createdAt: string;
  expiresAt: string;
  receipt: { amountKrw: number; approvedAt: string } | null;
  appliedAt: string | null;
  refund: { state: TeamRefundState; totalKrw: number } | null;
};
export type TeamOrderList = {
  currentUserId: string;
  items: TeamOrderSummary[];
  nextCursor: string | null;
};
export type TeamCheckout = {
  orderId: string;
  providerOrderId: string;
  orderName: string;
  amount: number;
  methods: string[];
  customerKey: "ANONYMOUS";
  expiresAt: string;
  client: TeamClientCheckout;
};
export type BillingOperationAction =
  | "order"
  | "confirm"
  | "profile"
  | "method.start"
  | "method.complete"
  | "method.remove"
  | "renewal"
  | "renewal.stop"
  | "refund";
export type BillingOperationReceipt = {
  currentUserId: string;
  receipt: Record<string, unknown> | null;
};
export type TeamRefundPreview = Pick<
  TeamRefund,
  | "orderId"
  | "refundPolicyVersion"
  | "settingsVersion"
  | "selection"
  | "basisAt"
  | "amounts"
  | "allowances"
  | "lines"
>;

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
