import { apiData } from './api-client';
import type { AdminCaseQueueItem, AuditEvent, Items } from './types';
const id = encodeURIComponent;
export const adminService = {
  disputes: (filter: 'ALL' | 'NEEDS_REVIEW' | 'APPROVAL_REQUESTS' | 'MANUAL' | 'CLOSED' = 'ALL', assignedToMe = false) => apiData<Items<AdminCaseQueueItem>>(`/admin/disputes?filter=${filter}&assignedToMe=${assignedToMe}`),
  detail: (caseId: string) => apiData<unknown>(`/admin/disputes/${id(caseId)}`),
  assign: (caseId: string, reviewerId: string, reason: string) => apiData<unknown>(`/admin/disputes/${id(caseId)}/assignments`, { method: 'POST', body: { reviewerId, reason, conflictDeclarationAccepted: true } }),
  intervene: (caseId: string, controlVersion: number, action: 'PAUSE' | 'RESUME' | 'REQUEST_INVESTIGATION' | 'ALLOW_VOLUNTARY_MEDIATION' | 'SET_MANUAL' | 'OFFICIAL_HANDOFF', reason: string, stepUpId: string) => apiData<unknown>(`/admin/disputes/${id(caseId)}/interventions`, { method: 'POST', ifMatch: controlVersion, body: { action, reason, stepUpId } }),
  approvalRequests: () => apiData<Items<unknown>>('/admin/approval-requests'),
  decideApproval: (requestId: string, proposalVersion: number, body: { decision: 'APPROVED' | 'REJECTED'; scope: string; paramsHash: string; caseVersion: number; stepUpId: string; reason: string }) => apiData<unknown>(`/admin/approval-requests/${id(requestId)}/decisions`, { method: 'POST', ifMatch: proposalVersion, body }),
  auditEvents: (caseId?: string) => apiData<Items<AuditEvent>>(`/admin/audit-events${caseId ? `?caseId=${id(caseId)}` : ''}`),
};
