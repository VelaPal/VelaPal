import { httpClient } from "@/lib/http-client";

export type AdminUserRecord = {
  id: string; name: string; emailCanonical: string; status: string;
  mfaEnabled: boolean; createdAt: string;
  memberships: { role: string; workspaceId: string; workspaceName: string; workspaceType: string }[];
};
export type AdminTransactionRecord = {
  id: string; orderId: string; customerId: string; merchantId: string;
  merchantName: string; amountMinor: number; refundableRemainingMinor: number;
  currency: string; paymentStatus: string; paypalOrderId: string | null;
  paypalCaptureId: string | null; verifiedAt: string | null; createdAt: string;
};
export type AdminAiRun = {
  runId: string; actorId: string; caseId: string | null; purpose: string;
  audience: string; status: string; inputVersion: number; modelMode: string | null;
  createdAt: string; updatedAt: string;
};
export type AdminMembership = {
  membershipId: string; userId: string; name: string; email: string; role: string;
  permissions: unknown; status: string; workspaceId: string; workspaceName: string;
  workspaceType: string;
};

export const adminOperationsService = {
  users: () => httpClient<{ items: AdminUserRecord[] }>("/admin/users"),
  transactions: () => httpClient<{ items: AdminTransactionRecord[] }>("/admin/transactions"),
  aiRuns: () => httpClient<{ items: AdminAiRun[]; jobs: { state: string; count: number }[] }>("/admin/ai-runs"),
  analytics: () => httpClient<{
    totals: { users: number; workspaces: number; transactions: number; cases: number; providerOperations: number };
    casesByStage: { stage: string; count: number }[];
    transactionsByStatus: { status: string; count: number }[];
  }>("/admin/analytics"),
  roles: () => httpClient<{ items: AdminMembership[] }>("/admin/roles"),
  settings: () => httpClient<{
    service: { name: string; status: string; contractVersion: string };
    integrations: Record<string, string>;
    checkedAt: string;
  }>("/admin/settings"),
};
