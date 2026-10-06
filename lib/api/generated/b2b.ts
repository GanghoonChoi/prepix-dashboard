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
/** V (2026-10-06): "team" = every internal team member sees the project, its
 * published videos and comments; "private" = explicit participants only. */
export type ProjectVisibility = "team" | "private";
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
  visibility: ProjectVisibility;
  requiresWorkingFiles: boolean;
  completionRuleRevision: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** "viewer": an internal member who sees a team project without taking
   * part in it (reads and review comments only, no work). */
  role: ProjectRole | "viewer";
  allowedActions: {
    read: boolean;
    edit: boolean;
    upload: boolean;
    managePeople: boolean;
    download: boolean;
    changeVisibility: boolean;
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
  /** Default "team". */
  visibility?: ProjectVisibility;
};
/** Lead only. Widening to "team" needs `confirmTeamWide: true` and a reason. */
export type ChangeProjectVisibility = RevisionMutation & {
  visibility: ProjectVisibility;
  confirmTeamWide?: boolean;
  reason?: string;
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
  // Legal floor: reserved by a mid-term termination; returned whole as a
  // withdrawal. SOT: backend/docs/b2b-legal-floor.md §1
  terminationId: string | null;
  withdrawal: boolean;
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
  // Legal floor: the open (or latest) re-consent to a changed renewal price,
  // and the latest mid-term termination. SOT: backend/docs/b2b-legal-floor.md
  renewalConsent: TeamRenewalConsent | null;
  termination: TeamTerminationStatus | null;
  serverTime: string;
};
export type TeamRenewalConsent = {
  id: string;
  state: "required" | "consented" | "declined" | "expired" | "superseded";
  reason: "price_increase" | "free_to_paid" | "terms_changed";
  fromProductVersion: string | null;
  toProductVersion: string;
  selection: { extraSeats: number; aiPacks: number; storagePacks: number };
  // Supply + VAT of the renewal at each version for the same selection.
  fromTotalKrw: number | null;
  toTotalKrw: number;
  // Consent counts only in [opensAt, chargeAt); no consent means no charge.
  opensAt: string;
  chargeAt: string;
  // Found later than the notice lead: fewer than the full window days remain.
  shortNotice: boolean;
  answeredAt: string | null;
  createdAt: string;
};
export type AcceptRenewalConsent = {
  requestKey: string;
  productVersion: string;
  expectedTotalKrw: number;
};
export type DeclineRenewalConsent = { requestKey: string };
export type TeamTerminationPreviewOrder = TeamRefundPreview & {
  withdrawal: boolean;
};
export type TeamTerminationPreview = {
  // Unused time is measured at basisAt; the period ends when the request lands.
  basisAt: string;
  previousEndsAt: string;
  renewalStops: boolean;
  withdrawal: boolean;
  settingsVersion: string;
  orders: TeamTerminationPreviewOrder[];
  amounts: { supplyKrw: number; vatKrw: number; totalKrw: number; currency: "KRW" };
};
export type CreateTeamTermination = {
  requestKey: string;
  reason: string;
  basisAt: string;
  expectedTotalKrw: number;
};
export type TeamTerminationResult = {
  terminationId: string;
  endedAt: string;
  previousEndsAt: string;
  withdrawal: boolean;
  totalKrw: number;
  refunds: { refundId: string; orderId: string; totalKrw: number; withdrawal: boolean }[];
  inFlightOrderId: string | null;
};
export type TeamTerminationStatus = {
  id: string;
  endedAt: string;
  previousEndsAt: string;
  withdrawal: boolean;
  requestedTotalKrw: number;
  // Only provider-confirmed refunds count as returned money.
  refundedKrw: number;
  pendingKrw: number;
  refunds: { refundId: string; orderId: string; state: TeamRefundState; totalKrw: number }[];
};
// Monthly personal-data access-log review (안전성 확보조치 기준 제8조).
export type LegalAccessReview = {
  month: string;
  state: "pending" | "reviewed";
  summary: Record<string, unknown>;
  summarySha256: string;
  reviewer: string | null;
  outcome: "no_issue" | "follow_up" | null;
  notes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  retainUntil: string;
};
// The reviewer is the verified console operator (F3 assertion), not a body field.
export type SignLegalAccessReview = {
  outcome: "no_issue" | "follow_up";
  notes: string;
  summarySha256: string;
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
  | "refund"
  | "termination"
  | "renewal.consent.accept"
  | "renewal.consent.decline";
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
  // Present for the configured whole-job roughcut operation only.
  maxClips?: number;
  maxTimelineDurationMs?: number;
  maxTotalInputBytes?: number;
  maxTotalDurationMs?: number;
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
  instructionSha256?: string;
  /** Present for agent quotes; immutable conditions from this quote's catalog. */
  roughcut?: { model: string; maxClips: number; maxTimelineDurationMs: number };
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
export type TeamAiResultFormat = "prepix.team-ai.result/v1" | "prepix.team-ai.roughcut/v1";
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
  format: "prepix.team-ai.result/v1";
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

// A whole-job edit plan. Millisecond integers address the measured input;
// array order is timeline order. Local sequence settings remain in the app.
export type TeamAiRoughcutPlan = {
  kind: "roughcut";
  provider: "gemini";
  model: string;
  summary: string;
  clips: {
    inputVersionId: string;
    inputSha256: string;
    startMs: number;
    endMs: number;
  }[];
};
export type TeamAiRoughcutResultDocument = {
  format: "prepix.team-ai.roughcut/v1";
  operation: "agent";
  workspaceId: string;
  projectId: string;
  jobId: string;
  quoteId: string;
  catalogVersion: string;
  instructionSha256: string;
  complete: true;
  inputs: {
    ordinal: number;
    inputVersionId: string;
    inputSha256: string;
    size: number;
    durationMs: number;
  }[];
  plan: TeamAiRoughcutPlan;
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
  /** Static, single-frame image measured from the scanned file. */
  image?: { codec: "png" | "mjpeg" | "webp"; width: number; height: number };
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
  audio: {
    codec: string;
    sampleRate: number;
    channels: number;
    /** The audio stream's own length; may be shorter than `durationMs`. */
    durationMs?: number;
  }[];
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
/** Optional since V: a result whose preview is ready is published to
 * everyone who can see the project automatically. A lead may still publish
 * early, or to a selected audience (`audienceUserIds` + approver). */
export type PublishPublication = {
  requestKey: string;
  revision: number;
  audienceUserIds?: string[];
  approverUserId?: string | null;
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
    /** V: "project" = everyone who can see the project (publication rounds,
     * no audience list); "selected" = the explicit audience below. */
    audienceScope: "project" | "selected";
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
/** "selected" (default, 0067): `audienceUserIds` and an approver among them.
 * "project" (V): everyone who can see the project; no list; the approver is
 * optional and must be a current explicit participant. */
export type ConfirmReviewAudience = {
  audienceScope?: "selected" | "project";
  audienceUserIds?: string[];
  approverUserId?: string | null;
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

/** Lookup acknowledges only this actor's original issue intent; it never issues. */
export type TeamStatementIssueLookup = {
  currentUserId: string;
  workspaceId: string;
  month: string;
  requestKey: string;
  inputHash: string;
  receipt: (TeamStatementIssueResult & { requestId: string }) | null;
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


/** F03: current actor's home. Limited cards never represent a team total. */
export type TeamHome = {
  currentUserId: string; workspaceId: string; serverTime: string;
  currentState: TeamState;
  period: { startsAt: string; endsAt: string; readUntil: string; recoveryUntil: string } | null;
  periods: { id: string; startsAt: string; endsAt: string;
    state: "current" | "scheduled" | "withheld" | "ended";
    licence: { id: string; state: LicenceState; startsAt: string; endsAt: string; scheduledRevokeAt: string | null } | null;
    aiBudget: { limitUnits: number; reservedUnits: number; confirmedUnits: number; remainingUnits: number } | null;
    aiUnitLabel: string; aiUnitDescription: string;
  }[];
  aiUsage: { reconciled: boolean; availableUnits: string | null; sampledAt: string } | null;
  aiUsageError: string | null;
  projects: { items: { id: string; name: string; state: ProjectState; visibility: ProjectVisibility; role: ProjectRole | "viewer"; updatedAt: string }[]; hasMore: boolean };
  /** V: newest published results whose review this viewer can open now. */
  recentPublications: { items: { publicationId: string; reviewId: string; projectId: string; projectName: string; title: string; versionId: string; ordinal: number; round: number; publishedAt: string }[]; hasMore: boolean };
  transfers: { items: { id: string; projectId: string; projectName: string; name: string; state: string; size: number; lastActivityAt: string }[]; hasMore: boolean };
  aiJobs: { items: { id: string; projectId: string; projectName: string; operation: TeamAiOperation; state: string; acceptedAt: string; resultVersionId: string | null }[]; hasMore: boolean };
  deliveries: { items: { projectId: string; projectName: string; packageId: string | null; state: "prepare" | "check" | "confirm" | "confirmed"; updatedAt: string }[]; hasMore: boolean };
};

// F17 team end-of-use, recovery and deletion (S26/S32, F2/F3 contracts).
// SOT: backend/docs/b2b-team-lifecycle-deletion.md
export type TeamDeletionState =
  | "waiting"
  | "held"
  | "ops_check"
  | "running"
  | "completed"
  | "superseded";
export type TeamDeletionBlockReason =
  | "payment_hold"
  | "payment_unknown"
  | "received_unapplied"
  | "review_required"
  | "order_pending"
  | "settings_missing"
  | "operator_hold"
  | "operator_released"
  // (integration) E+ legal floor pre-deletion hook: retention settings or the
  // archive key are missing, a statement month is not issued yet (waiting),
  // or a refund is still open (ops_check).
  | "retention_settings_missing"
  | "statement_pending"
  | "refund_open";
export type TeamDeletionObjectState = "pending" | "deleted" | "failed";
export type TeamBackupPurgeState = "pending" | "purged" | "unverified" | "failed";
export type TeamBackupPurgeResultState =
  | "purged"
  | "absent"
  | "unverifiable"
  | "failed";
export type TeamLifecycleBoundary = "ended" | "recovery_storage" | "deletion_due";
// Customer-visible view. `recovery` is null without billing permission.
export type TeamLifecycle = {
  workspaceId: string;
  serverTime: string;
  currentState: TeamState;
  policyVersion: string;
  periodEndsAt: string | null;
  boundaries: {
    readOnlyFrom: string;
    recoveryFrom: string;
    deletionFrom: string;
  } | null;
  allowedActions: {
    openContent: boolean;
    download: boolean;
    edit: boolean;
    restorePurchase: boolean;
    billing: boolean;
  };
  deletion: {
    state: TeamDeletionState | "not_started";
    /** True while deletion is not yet allowed to run (checks, holds, missing
     * settings): no firm start time is promised. For non-billing viewers every
     * pre-start state is shown as `waiting` + `preparing`. */
    preparing: boolean;
    startedAt: string | null;
    completedAt: string | null;
    backup: { state: TeamBackupPurgeState; dueAt: string } | null;
  };
  recovery: {
    holdStartedAt: string | null;
    holdEndsAt: string | null;
    holdUsed: boolean;
    pendingOrder: { id: string; state: TeamOrderState } | null;
    opsCheck: {
      reason: TeamDeletionBlockReason;
      since: string;
      deadline: string | null;
    } | null;
  } | null;
};
// F3 operator accessors (service methods, not HTTP). operatorId is the
// server-verified console identity; grantId is F3's operations grant evidence.
export type TeamDeletionOperator = {
  operatorId: string;
  grantId: string;
  reason: string;
  requestKey: string;
};
export type TeamDeletionOpsReceipt = {
  jobId: string;
  action: "hold" | "release" | "assign" | "retry";
  state: TeamDeletionState;
  revision: number;
  requestId: string;
};
export type TeamRecoveryReprocessReceipt = {
  orderId: string;
  action: "reprocess";
  orderState: TeamOrderState;
  applicationId: string | null;
  requestId: string;
};
export type TeamDeletionOpsView = {
  workspaceId: string;
  currentState: TeamState;
  periodEndsAt: string | null;
  jobs: {
    id: string;
    periodEndsAt: string;
    state: TeamDeletionState;
    blockReason: TeamDeletionBlockReason | null;
    blockedOrderId: string | null;
    opsSince: string | null;
    opsDeadline: string | null;
    opsAssignee: string | null;
    policyVersion: string | null;
    startedAt: string | null;
    completedAt: string | null;
    lastError: string | null;
    revision: number;
    objects: Record<TeamDeletionObjectState, number>;
    backup: {
      state: TeamBackupPurgeState | null;
      dueAt: string | null;
      verifiedAt: string | null;
      copies: {
        backupId: string;
        state: TeamBackupPurgeResultState;
        verifiedAt: string | null;
      }[];
    };
    actions: {
      action: string;
      operatorId: string;
      reason: string;
      createdAt: string;
    }[];
  }[];
  recoverySafety: {
    periodEndsAt: string;
    holdStartedAt: string | null;
    holdEndsAt: string | null;
    blockedOrderId: string | null;
    blockedReason: string | null;
    blockedSince: string | null;
  }[];
};
// The accessor contract F3 calls and F1's B2bTeamDeletionOpsService
// implements (SOT: backend/docs/b2b-team-lifecycle-deletion.md §10).
export type TeamDeletionOps = {
  view(workspaceId: string): Promise<TeamDeletionOpsView>;
  hold(input: {
    workspaceId: string;
    periodEndsAt: string;
    expectedState: "none" | "waiting" | "ops_check";
    operator: TeamDeletionOperator;
  }): Promise<TeamDeletionOpsReceipt>;
  release(input: {
    workspaceId: string;
    jobId: string;
    expectedState: "held" | "ops_check";
    operator: TeamDeletionOperator;
  }): Promise<TeamDeletionOpsReceipt>;
  assign(input: {
    workspaceId: string;
    jobId: string;
    expectedState: "ops_check";
    assignee: string;
    operator: TeamDeletionOperator;
  }): Promise<TeamDeletionOpsReceipt>;
  retry(input: {
    workspaceId: string;
    jobId: string;
    expectedState: "running";
    operator: TeamDeletionOperator;
  }): Promise<TeamDeletionOpsReceipt & { objects: number }>;
  reprocessRecoveryOrder(input: {
    workspaceId: string;
    orderId: string;
    expectedOrderState: "received" | "review_required";
    operator: TeamDeletionOperator;
  }): Promise<TeamRecoveryReprocessReceipt>;
};

// F19/S27 user notifications. SOT: backend/docs/b2b-user-notifications.md.
// Names are resolved at read time only while access is current; `lost` items
// carry no team, project or target and render as a generic notice.
export type UserNotificationKind =
  | "request.assigned"
  | "request.proposed"
  | "request.accepted"
  | "request.submitted"
  | "request.confirmed"
  | "request.returned"
  | "request.declined"
  | "participation.changed"
  | "participation.ended"
  | "project.lead_assigned"
  | "membership.changed"
  | "transfer.failed"
  | "payment.received"
  | "payment.unknown"
  | "payment.review_required"
  | "payment.failed"
  | "payment.applied"
  // (integration) E+ legal floor, billing audience only.
  | "payment.renewal_consent_required"
  | "payment.terminated"
  | "payment.statement_issued"
  | "lifecycle.period_ended"
  | "lifecycle.recovery_storage"
  | "lifecycle.deletion_due"
  | "lifecycle.ops_check"
  | "lifecycle.deletion_started"
  | "lifecycle.deletion_completed"
  | "notice.period_ending"
  | "notice.deletion_scheduled"
  | "review.requested"
  | "review.approval_assigned"
  | "review.decided";
export type UserNotification = {
  id: string;
  kind: UserNotificationKind;
  createdAt: string;
  readAt: string | null;
  access: "current" | "lost";
  team: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  params: Record<string, string | number | boolean>;
};
export type UserNotificationList = {
  currentUserId: string;
  items: UserNotification[];
  nextCursor: string | null;
  unreadCount: number;
};
export type UserNotificationUnread = {
  currentUserId: string;
  unreadCount: number;
};
export type UserNotificationRead = {
  currentUserId: string;
  notificationId: string;
  readAt: string | null;
  unreadCount: number;
};
export type UserNotificationDestination =
  | { kind: "request"; workspaceId: string; projectId: string; requestId: string }
  // The exact round the notice was about; a newer round never replaces it.
  | { kind: "review"; workspaceId: string; projectId: string; reviewId: string; round: number; versionId: string }
  | { kind: "project"; workspaceId: string; projectId: string }
  | { kind: "project_files"; workspaceId: string; projectId: string }
  | { kind: "library"; workspaceId: string }
  | { kind: "billing"; workspaceId: string }
  | { kind: "team_status"; workspaceId: string }
  | { kind: "team"; workspaceId: string };
// `destination: null` means the target is no longer available to this
// account: show the generic access notice. Opening never grants access.
export type UserNotificationOpen = {
  currentUserId: string;
  notificationId: string;
  destination: UserNotificationDestination | null;
};
