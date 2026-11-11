import { httpClient } from "@/lib/http-client";
import { workspaceRequestSignal } from "./api-client";
import type {
  Audience,
  AiRunStatus,
  ConsentIntent,
  DisputeCase,
  DisputeCategory,
  BoundDisputeDetail,
  BoundEvidenceSource,
  Items,
  SourceRef,
  SettlementRoute,
} from "./types";
const id = encodeURIComponent;
type CasePayload = Omit<DisputeCase, "id"> & {
  id?: string;
  caseId?: string;
};
function normalizeCase(value: CasePayload): DisputeCase {
  const { caseId, ...fields } = value;
  const normalizedId = value.id ?? caseId;
  if (!normalizedId) throw new Error("Dispute response is missing its id.");
  return { ...fields, id: normalizedId };
}
export const disputesService = {
  async list() {
    const response = await httpClient<{
      items?: CasePayload[];
      nextCursor?: string | null;
    }>("/disputes");
    return {
      ...response,
      items: (response.items ?? []).map(normalizeCase),
    } satisfies Items<DisputeCase>;
  },
  async get(caseId: string) {
    const response = await httpClient<
      Omit<BoundDisputeDetail, "case"> & { case: CasePayload }
    >(`/disputes/${id(caseId)}`);
    return {
      ...response,
      case: normalizeCase(response.case),
    } satisfies BoundDisputeDetail;
  },
  async create(
    body: {
      transactionId: string | null;
      orderId: string | null;
      category: DisputeCategory;
      statement: string;
      audience: "CASE_SHARED";
    },
    key: string,
  ) {
    const response = await httpClient<{
      id?: string;
      caseId?: string;
      transactionId: string | null;
      orderId: string | null;
      initiatorParty: "CUSTOMER" | "SELLER";
      category: DisputeCategory;
      stage: string;
      control: string;
      caseVersion: number;
      controlVersion: number;
      privateContextVersion: number;
      accessRevision: number;
      nextAction: string;
    }>("/disputes", { method: "POST", body, idempotencyKey: key });
    const normalizedId = response.id ?? response.caseId;
    if (!normalizedId)
      throw new Error("Create dispute response is missing its id.");
    const fields = { ...response };
    delete fields.caseId;
    return { ...fields, id: normalizedId };
  },
  message: (
    caseId: string,
    body: {
      text: string;
      sourceRefs: SourceRef[];
      audience: "PRIVATE" | "CASE_SHARED";
    },
    version: number,
  ) =>
    httpClient<{
      messageId: string;
      party: "CUSTOMER" | "SELLER";
      audience: Audience;
      caseVersion: number;
      privateContextVersion: number;
    }>(`/disputes/${id(caseId)}/messages`, {
      method: "POST",
      body,
      ifMatch: version,
    }),
  uploadIntent: (
    caseId: string,
    body: { mime: string; byteCount: number; originalName: string },
  ) =>
    httpClient<{
      sourceId: string;
      uploadId: string;
      sourceVersion: number;
      audience: Audience;
      scanState: string;
      uploadHandle: { method: "PUT"; url: string; expiresInSeconds: number };
    }>(`/disputes/${id(caseId)}/sources/upload-intents`, {
      method: "POST",
      body,
    }),
  /** Upload bytes to short-lived handle URL with a direct PUT, then call finalize. Never send browser CSRF or session cookie to unrelated object storage origins. */
  async uploadBytes(handle: { method: "PUT"; url: string }, blob: Blob) {
    let response: Response;
    try {
      response = await fetch(handle.url, {
        method: "PUT",
        body: blob,
        credentials: "omit",
        signal: workspaceRequestSignal(),
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") throw cause;
      const detail = cause instanceof Error ? ` (${cause.message})` : "";
      throw new Error(
        `Direct upload failed before the storage server responded${detail}. Check the signed upload URL and storage CORS configuration.`,
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      let detail = body.trim();
      try {
        const parsed: unknown = JSON.parse(detail);
        if (parsed && typeof parsed === "object") {
          const value = parsed as { message?: unknown; error?: unknown };
          detail =
            (typeof value.message === "string" && value.message) ||
            (typeof value.error === "string" && value.error) ||
            detail;
        }
      } catch {}
      if (detail.length > 500) detail = `${detail.slice(0, 500)}…`;
      throw new Error(
        `Upload failed: HTTP ${response.status}${detail ? ` — ${detail}` : ` (${response.statusText || "no response details"})`}`,
      );
    }
  },
  finalize: (
    caseId: string,
    sourceId: string,
    uploadId: string,
    sourceVersion: number,
  ) =>
    httpClient<{
      sourceId: string;
      sourceVersion: number;
      audience: Audience;
      scanState: "SCANNING";
      readyForAnalysis: false;
      indexJobStatus: string;
    }>(
      `/disputes/${id(caseId)}/sources/${id(sourceId)}/finalize`,
      { method: "POST", body: { uploadId }, ifMatch: sourceVersion },
    ),
  getSource: (caseId: string, sourceId: string) =>
    httpClient<BoundEvidenceSource>(
      `/disputes/${id(caseId)}/sources/${id(sourceId)}`,
    ),
  shareSource: (
    caseId: string,
    sourceId: string,
    sourceVersion: number,
    audience: "CASE_SHARED" | "PROVIDER_SHARED",
    paramsHash: string,
  ) =>
    httpClient<{
      sourceId: string;
      sourceVersion: number;
      audience: Audience;
      consentId: string;
      caseVersion: number;
      accessRevision: number;
      invalidatedProposalIds: string[];
    }>(`/disputes/${id(caseId)}/sources/${id(sourceId)}/share`, {
      method: "POST",
      ifMatch: sourceVersion,
      body: {
        audience,
        consentIntent: "SHARE_SOURCE" satisfies ConsentIntent,
        paramsHash,
      },
    }),
  revokeSource: (
    caseId: string,
    sourceId: string,
    sourceVersion: number,
    reason: string,
  ) =>
    httpClient<{
      sourceId: string;
      sourceVersion: number;
      audience: "REVOKED";
      caseVersion: number;
      accessRevision: number;
      invalidatedProposalIds: string[];
      purgeScheduled: boolean;
    }>(`/disputes/${id(caseId)}/sources/${id(sourceId)}/revoke`, {
      method: "POST",
      ifMatch: sourceVersion,
      body: { reason },
    }),
  assess: (caseId: string, caseVersion: number) =>
    httpClient<{
      runId: string;
      caseId: string;
      inputVersion: number;
      status: AiRunStatus;
    }>(`/disputes/${id(caseId)}/assessments`, {
      method: "POST",
      body: {},
      ifMatch: caseVersion,
    }),
  mediationConsent: (
    caseId: string,
    caseVersion: number,
    assessmentRunId: string,
    paramsHash: string,
    decision: "APPROVED" | "REJECTED",
  ) =>
    httpClient<{
      consentId: string;
      caseId: string;
      party: "CUSTOMER" | "SELLER";
      intent: "CONTINUE_MEDIATION";
      decision: "APPROVED" | "REJECTED";
      caseVersion: number;
      approvedAt: string;
    }>(`/disputes/${id(caseId)}/mediation-consents`, {
      method: "POST",
      ifMatch: caseVersion,
      body: {
        consentIntent: "CONTINUE_MEDIATION",
        assessmentRunId,
        paramsHash,
        decision,
      },
    }),
  propose: (
    caseId: string,
    caseVersion: number,
    body: {
      terms: string;
      money: { amountMinor: number; currency: "USD" };
      route: SettlementRoute;
      sourceDigest: string;
      expiresInMinutes: number;
    },
  ) =>
    httpClient<{
      proposalId: string;
      proposalVersion: number;
      proposerParty: "CUSTOMER" | "SELLER";
      caseVersion: number;
      stage: string;
      actionRequestId: string;
      paramsHash: string;
      requiredConsents: Array<{ party: "CUSTOMER" | "SELLER"; intent: ConsentIntent; status: "PENDING" }>;
      expiresAt: string;
    }>(`/disputes/${id(caseId)}/proposals`, {
      method: "POST",
      ifMatch: caseVersion,
      body,
    }),
  requestReview: (
    caseId: string,
    body: {
      reason: string;
      contestedFindingIds: string[];
      newSourceRefs: SourceRef[];
    },
  ) =>
    httpClient<{
      reviewRequestId: string;
      caseId: string;
      control: string;
      controlVersion: number;
      caseVersion: number;
    }>(`/disputes/${id(caseId)}/reviews`, {
      method: "POST",
      body,
    }),
  grantConsent: (
    actionRequestId: string,
    proposalVersion: number,
    body: {
      paramsHash: string;
      caseVersion: number;
      intent: "ACCEPT_PROPOSAL_TERMS" | "AUTHORIZE_FINANCIAL_EXECUTION";
      decision: "APPROVED" | "REJECTED";
      stepUpId: string | null;
    },
  ) =>
    httpClient<{
      consentId: string;
      actionRequestId: string;
      party: "CUSTOMER" | "SELLER";
      intent: "ACCEPT_PROPOSAL_TERMS" | "AUTHORIZE_FINANCIAL_EXECUTION";
      decision: "APPROVED" | "REJECTED";
      paramsHash: string;
      allRequiredConsentsMet: boolean;
      approvedAt: string;
      expiresAt: string;
    }>(`/action-requests/${id(actionRequestId)}/consents`, {
      method: "POST",
      ifMatch: proposalVersion,
      body,
    }),
  execute: (
    actionRequestId: string,
    caseVersion: number,
    paramsHash: string,
    key: string,
  ) =>
    httpClient<{
      operationId: string;
      type: string;
      actionRequestId: string;
      caseStage: string;
      operationStatus: string;
      pollUrl: string;
    }>(`/action-requests/${id(actionRequestId)}/execute`, {
      method: "POST",
      ifMatch: caseVersion,
      idempotencyKey: key,
      body: { paramsHash },
    }),
};
