import { apiData } from "./api-client";
import type {
  AdminCaseQueueItem,
  AdminDetail,
  ApprovalRequest,
  AuditEvent,
  Items,
} from "./types";
const id = encodeURIComponent;
type CaseQueuePayload = Omit<AdminCaseQueueItem, "id"> & {
  id?: string;
  caseId?: string;
};
type AdminDetailCasePayload = Omit<AdminDetail["case"], "id"> & {
  id?: string;
  caseId?: string;
};
function normalizeQueueItem(value: CaseQueuePayload): AdminCaseQueueItem {
  const { caseId, ...fields } = value;
  const normalizedId = value.id ?? caseId;
  if (!normalizedId) throw new Error("Admin case response is missing its id.");
  return { ...fields, id: normalizedId };
}
export const adminService = {
  async disputes(
    filter:
      | "ALL"
      | "NEEDS_REVIEW"
      | "APPROVAL_REQUESTS"
      | "MANUAL"
      | "CLOSED" = "ALL",
    assignedToMe = false,
  ) {
    const response = await apiData<{
      items?: CaseQueuePayload[];
      nextCursor?: string | null;
    }>(
      `/admin/disputes?filter=${filter}&assignedToMe=${assignedToMe}`,
    );
    return {
      ...response,
      items: (response.items ?? []).map(normalizeQueueItem),
    } satisfies Items<AdminCaseQueueItem>;
  },
  async detail(caseId: string) {
    const response = await apiData<
      Omit<AdminDetail, "case"> & { case: AdminDetailCasePayload }
    >(`/admin/disputes/${id(caseId)}`);
    const { caseId: legacyCaseId, ...caseFields } = response.case;
    const normalizedId = response.case.id ?? legacyCaseId;
    if (!normalizedId)
      throw new Error("Admin case response is missing its id.");
    return {
      ...response,
      case: { ...caseFields, id: normalizedId },
    } satisfies AdminDetail;
  },
  assign: (caseId: string, reviewerId: string, reason: string) =>
    apiData<unknown>(`/admin/disputes/${id(caseId)}/assignments`, {
      method: "POST",
      body: { reviewerId, reason, conflictDeclarationAccepted: true },
    }),
  intervene: (
    caseId: string,
    controlVersion: number,
    action:
      | "PAUSE"
      | "RESUME"
      | "REQUEST_INVESTIGATION"
      | "ALLOW_VOLUNTARY_MEDIATION"
      | "SET_MANUAL"
      | "OFFICIAL_HANDOFF",
    reason: string,
    stepUpId: string,
  ) =>
    apiData<unknown>(`/admin/disputes/${id(caseId)}/interventions`, {
      method: "POST",
      ifMatch: controlVersion,
      body: { action, reason, stepUpId },
    }),
  approvalRequests: () =>
    apiData<Items<ApprovalRequest>>("/admin/approval-requests"),
  decideApproval: (
    requestId: string,
    proposalVersion: number,
    body: {
      decision: "APPROVED" | "REJECTED";
      scope: string;
      paramsHash: string;
      caseVersion: number;
      stepUpId: string;
      reason: string;
    },
  ) =>
    apiData<unknown>(`/admin/approval-requests/${id(requestId)}/decisions`, {
      method: "POST",
      ifMatch: proposalVersion,
      body,
    }),
  auditEvents: (caseId?: string) =>
    apiData<Items<AuditEvent>>(
      `/admin/audit-events${caseId ? `?caseId=${id(caseId)}` : ""}`,
    ),
};
