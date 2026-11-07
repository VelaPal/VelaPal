// VelaPal V6.1 Frozen Enums & Shared DTO Types

export type CaseStage =
  | "AWAITING_EVIDENCE"
  | "MEDIATING"
  | "AWAITING_CONSENT"
  | "EXECUTION_PENDING"
  | "EXECUTION_UNKNOWN"
  | "EXTERNAL_PENDING"
  | "RESOLVED"
  | "CLOSED_NO_AGREEMENT";

export type WorkflowControl = "RUNNING" | "WAITING_ADMIN" | "PAUSED" | "MANUAL";

export type OperationStatus = "IDLE" | "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "UNAVAILABLE";

export type OperationType = "ORDER_CAPTURE" | "CAPTURE_REFUND" | "DISPUTE_MAKE_OFFER" | "SUBSCRIPTION_CANCEL";

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

export type PartyType = "CUSTOMER" | "SELLER";

export type AudienceType = "PRIVATE" | "CASE_SHARED" | "PROVIDER_SHARED" | "REVOKED";

export type ScanState = "QUARANTINED" | "SCANNING" | "CLEAN" | "REJECTED";

export type AiPurpose =
  | "PERSONAL_ASSISTANT"
  | "CUSTOMER_PREPARATION"
  | "SELLER_PREPARATION"
  | "SHARED_ASSESSMENT";

export type AiRunStatus = "QUEUED" | "RUNNING" | "NEEDS_INFO" | "COMPLETED" | "ABSTAINED" | "STALE" | "FAILED";

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

export type SettlementRoute = "PAYPAL_CAPTURE_REFUND" | "PAYPAL_DISPUTE_MAKE_OFFER" | "OFFICIAL_HANDOFF";

export interface SourceRefDTO {
  sourceId: string;
  version: number;
  locator: string;
}

export interface SharedAssessmentDTO {
  runId: string;
  inputVersion: number;
  status: AiRunStatus;
  audience: AudienceType;
  modelMode: "live" | "fixture";
  businessDataMode: "paypal_sandbox" | "synthetic_fixture";
  category: DisputeCategory;
  verifiedFacts: Array<{ text: string; sourceRefs: SourceRefDTO[] }>;
  claims: Array<{ party: PartyType; text: string; sourceRefs: SourceRefDTO[] }>;
  findings: Array<{ findingId: string; kind: "CONFLICT" | "OBSERVATION" | "GAP"; text: string; sourceRefs: SourceRefDTO[] }>;
  missingEvidence: string[];
  uncertainty: string;
  policyReferences: string[];
  nextStep: AiNextStep;
  requiresHumanApproval: boolean;
  manifestHash?: string;
  modelVersion?: string;
  promptVersion?: string;
  policyVersion?: string;
  counters: {
    generativeCalls: number;
    embeddingQueries: number;
    retrievedChunks: number;
    elapsedMs: number;
  };
}
