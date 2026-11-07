/** FE DTOs aligned to VelaPal Frozen API Contract 6.1.1 (2026-11-05).
 * Some list responses are not fully specified in the master contract: keep those
 * shapes minimal until BE publishes machine-readable OpenAPI.
 */
export type WorkspaceType = "CUSTOMER" | "SELLER" | "ADMIN";
export type PartyType = "CUSTOMER" | "SELLER";
export type Audience =
  "PRIVATE" | "CASE_SHARED" | "PROVIDER_SHARED" | "REVOKED";
export type CaseStage =
  | "AWAITING_EVIDENCE"
  | "MEDIATING"
  | "AWAITING_CONSENT"
  | "EXECUTION_PENDING"
  | "EXECUTION_UNKNOWN"
  | "EXTERNAL_PENDING"
  | "RESOLVED"
  | "CLOSED_NO_AGREEMENT";
export type CaseControl = "RUNNING" | "WAITING_ADMIN" | "PAUSED" | "MANUAL";
export type OperationStatus =
  "IDLE" | "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "UNAVAILABLE";
export type PaymentStatus =
  | "APPROVAL_PENDING"
  | "UNCONFIRMED"
  | "PAID"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED"
  | "FAILED"
  | "UNKNOWN";
export type DisputeCategory =
  | "ITEM_NOT_AS_DESCRIBED"
  | "ITEM_NOT_RECEIVED"
  | "PAYMENT_NOT_CONFIRMED"
  | "FULFILMENT_OR_RETURN_ISSUE"
  | "BILLING_OR_RENEWAL_CONCERN"
  | "CONTESTED_CLAIM";
export type ScanState = "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED";
export type AiPurpose =
  | "PERSONAL_ASSISTANT"
  | "CUSTOMER_PREPARATION"
  | "SELLER_PREPARATION"
  | "SHARED_ASSESSMENT";
export type AiRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "NEEDS_INFO"
  | "COMPLETED"
  | "ABSTAINED"
  | "STALE"
  | "FAILED";
export type AiNextStep =
  | "REQUEST_CLARIFICATION"
  | "REQUEST_PACKING_SERIAL"
  | "REQUEST_PAYMENT_PROOF"
  | "PROPOSE_VOLUNTARY_SETTLEMENT"
  | "ESCALATE_TO_ADMIN"
  | "OFFICIAL_CHANNEL_HANDOFF"
  | "NONE";
export type ConsentIntent =
  | "SHARE_SOURCE"
  | "CONTINUE_MEDIATION"
  | "ACCEPT_PROPOSAL_TERMS"
  | "AUTHORIZE_FINANCIAL_EXECUTION";
export type SettlementRoute =
  "PAYPAL_CAPTURE_REFUND" | "PAYPAL_DISPUTE_MAKE_OFFER" | "OFFICIAL_HANDOFF";
export type OperationType =
  | "ORDER_CAPTURE"
  | "CAPTURE_REFUND"
  | "DISPUTE_MAKE_OFFER"
  | "SUBSCRIPTION_CANCEL";
export interface ApiMeta {
  traceId: string;
  version: number;
  timestamp: string;
}
export interface ApiEnvelope<T> {
  data: T;
  meta: ApiMeta;
}
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, unknown>;
    traceId: string;
    retryable: boolean;
    currentVersion?: number;
  };
}
export interface User {
  id: string;
  email: string;
  name: string;
}
export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  merchantId: string | null;
  role: string;
}
export interface AuthenticatedSession {
  status: "AUTHENTICATED";
  csrfToken: string;
  user: User;
  activeWorkspace: Workspace;
  purpose?: "SESSION_LOGIN";
}
export interface MfaChallenge {
  status: "MFA_REQUIRED";
  challengeId: string;
  purpose: "SESSION_LOGIN";
  targetId: null;
  expiresAt: string;
}
export type LoginResponse = AuthenticatedSession | MfaChallenge;
export interface StepUpVerified {
  status: "STEP_UP_VERIFIED";
  stepUpId: string;
  purpose: string;
  targetId: string | null;
  expiresAt: string;
}
export interface Transaction {
  id: string;
  orderId: string;
  customerId: string;
  merchantId: string;
  merchantName: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  amountMinor: number;
  refundableRemainingMinor: number;
  currency: "USD";
  paymentStatus: PaymentStatus;
  verifiedAt: string | null;
}
export interface PurchaseSnapshot {
  snapshotId: string;
  sku: string;
  variantId: string;
  quantity?: number;
  amountMinor: number;
  currency: "USD";
  snapshotHash?: string;
}
export interface TransactionDetail {
  transaction: Transaction;
  snapshot: PurchaseSnapshot;
  activeCaseId: string | null;
}
export interface SourceRef {
  sourceId: string;
  version: number;
  locator: string;
}
export interface EvidenceSource {
  sourceId: string;
  sourceVersion: number;
  ownerParty: PartyType;
  originalName: string;
  mime: string;
  scanState: ScanState;
  audience: Audience;
  sha256: string | null;
  locator: string | null;
}
export interface CaseMessage {
  messageId: string;
  authorParty: PartyType;
  audience: Audience;
  text: string;
  sourceRefs: SourceRef[];
  createdAt: string;
}
export interface AssessmentFact {
  text: string;
  sourceRefs: SourceRef[];
}
export interface AssessmentClaim extends AssessmentFact {
  party: PartyType;
}
export interface AssessmentFinding extends AssessmentFact {
  findingId: string;
  kind: "OBSERVATION" | "CONFLICT" | "GAP" | string;
}
export interface LatestAssessment {
  runId: string;
  inputVersion: number;
  status: AiRunStatus;
  audience: Audience;
  modelMode: "live" | "fixture";
  businessDataMode: "paypal_sandbox" | "synthetic_fixture";
  category: DisputeCategory;
  verifiedFacts: AssessmentFact[];
  claims: AssessmentClaim[];
  findings: AssessmentFinding[];
  missingEvidence: string[];
  uncertainty: string;
  policyReferences: string[];
  nextStep: AiNextStep;
  requiresHumanApproval: boolean;
}
export interface CaseCapabilities {
  canShareEvidence: boolean;
  canPostMessage: boolean;
  canProposeTerms: boolean;
  canGrantConsent: boolean;
  canExecuteSettlement: boolean;
  canRequestReview: boolean;
  supportedSettlementRoutes: SettlementRoute[];
}
export interface DisputeCase {
  id: string;
  transactionId: string | null;
  orderId: string | null;
  merchantId: string;
  initiatorParty: PartyType;
  category: DisputeCategory;
  stage: CaseStage;
  control: CaseControl;
  caseVersion: number;
  controlVersion: number;
  privateContextVersion: number;
  accessRevision: number;
  nextAction: string;
  officialPaypalDisputeId: string | null;
  capabilities: CaseCapabilities;
}
export interface ProviderOperationBrief {
  operationId: string | null;
  type: OperationType | null;
  route: SettlementRoute | null;
  status: OperationStatus;
  providerRef: string | null;
  verifiedAt: string | null;
}
export interface Proposal {
  proposalId: string;
  proposalVersion: number;
  proposerParty: PartyType;
  caseVersion: number;
  actionRequestId: string;
  terms: string;
  money: { amountMinor: number; currency: "USD" };
  route: SettlementRoute;
  sourceDigest: string;
  paramsHash: string;
  status: string;
  expiresAt: string;
}
export interface PendingConsent {
  party: PartyType;
  intent: ConsentIntent;
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt: string | null;
}
export interface TimelineEvent {
  eventId: string;
  type: string;
  actorParty: PartyType | "ADMIN";
  summary: string;
  caseVersion: number;
  at: string;
}
export interface DisputeDetail {
  case: DisputeCase;
  providerOperation: ProviderOperationBrief;
  snapshot: PurchaseSnapshot;
  perspectives: {
    customerStatement: string | null;
    sellerStatement: string | null;
  };
  sources: EvidenceSource[];
  messages: CaseMessage[];
  latestAssessment: LatestAssessment | null;
  activeProposal: Proposal | null;
  pendingConsents: PendingConsent[];
  activityTimeline: TimelineEvent[];
}
export interface Operation {
  operationId: string;
  type: OperationType;
  actionRequestId: string | null;
  caseId: string | null;
  route: SettlementRoute;
  status: OperationStatus;
  amountMinor: number;
  currency: "USD";
  providerRef: string | null;
  lastCheckedAt: string | null;
  verifiedAt: string | null;
  nextStep: string;
  caseStage?: CaseStage;
}
export interface AgentRun {
  runId: string;
  purpose: AiPurpose;
  audience: Audience;
  status: AiRunStatus;
  pollUrl?: string;
  inputVersion?: number;
  caseId?: string | null;
  modelMode?: "fixture" | "live";
  businessDataMode?: "synthetic_fixture" | "paypal_sandbox";
  result?: unknown;
}
export interface AdminCaseQueueItem {
  id: string;
  transactionId: string | null;
  merchantId: string;
  initiatorParty: PartyType;
  stage: CaseStage;
  control: CaseControl;
  controlVersion: number;
  caseVersion: number;
  gateReason: string | null;
  assignedReviewerId: string | null;
  pendingApprovalRequestId: string | null;
  updatedAt: string;
}
export interface AuditEvent {
  auditId: string;
  eventName: string;
  actorId: string;
  workspaceId: string;
  targetType: string;
  targetId: string;
  reason: string;
  caseVersion: number;
  controlVersion: number;
  traceId: string;
  createdAt: string;
}
export interface Items<T> {
  items: T[];
  nextCursor?: string | null;
}

/** Optional mock-only metadata. Not part of the frozen backend DTO.
 * In live mode these actions remain unavailable until BE supplies authoritative bindings.
 */
export interface MockConsentBindings {
  modelMode: "fixture";
  sourceDigest: string;
  mediationParamsHash: string;
}
export type BoundDisputeDetail = DisputeDetail & {
  mockConsentBindings?: MockConsentBindings;
};
export type BoundEvidenceSource = EvidenceSource & {
  mockShareParamsHash?: string;
  previewUrl?: string | null;
};
export interface AdminDetail {
  case: DisputeCase & {
    assignedReviewerId: string | null;
    investigationAccessGranted: boolean;
  };
  sharedSources?: EvidenceSource[];
  sharedPerspectives?: {
    customerStatement: string | null;
    sellerStatement: string | null;
  };
  latestAssessment?: LatestAssessment | null;
  pendingApprovalRequests: unknown[];
}
export interface ApprovalRequest {
  approvalRequestId: string;
  caseId: string;
  actionRequestId: string;
  scope: string;
  amountMinor: number;
  currency: "USD";
  paramsHash: string;
  caseVersion: number;
  proposalVersion: number;
  status: string;
  createdAt: string;
}
export interface CatalogProduct {
  id: string;
  name: string;
  merchantId: string;
  variants: { id: string; amountMinor: number }[];
  currency: "USD";
}
