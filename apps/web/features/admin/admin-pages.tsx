"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { formatDate, formatMoney } from "@/lib/format";
import { ErrorNotice, Panel } from "@/components/ui/workflow";
import { useSession } from "@/features/auth/session";
import { adminOperationsService } from "@/services/contracts/admin-operations.service";
import { AuditEvents } from "./admin-investigation";
import { AdminBadge, AdminHeading, AdminSearch, AdminTable } from "./admin-ui";
import { ApiAdminMerchants } from "./admin-merchants-api";

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  if (session?.activeWorkspace.type !== "ADMIN")
    return <p role="alert">Admin workspace access required.</p>;
  return <div className="vp-admin-page">{children}</div>;
}

export function AdminUsers() {
  const data = useSWR("admin-users", adminOperationsService.users);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => (data.data?.items ?? []).filter((user) =>
    `${user.name} ${user.emailCanonical} ${user.id} ${user.memberships.map((m) => `${m.role} ${m.workspaceName}`).join(" ")}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.data, query]);
  return <AdminOnly>
    <AdminHeading title="Users" description="Accounts and active workspace memberships from the application database." />
    <ErrorNotice error={data.error} />
    <AdminSearch label="Search users" value={query} onChange={setQuery} />
    {data.isLoading && <p role="status">Loading users...</p>}
    {data.data && <AdminTable headers={["User", "Status", "Workspaces", "MFA", "Created"]}>
      {rows.map((user) => <tr key={user.id}>
        <td><strong>{user.name}</strong><small>{user.emailCanonical} · {user.id}</small></td>
        <td><AdminBadge>{user.status}</AdminBadge></td>
        <td>{user.memberships.length ? user.memberships.map((m) => `${m.workspaceName} (${m.role})`).join(", ") : "No active membership"}</td>
        <td>{user.mfaEnabled ? "Enabled" : "Not enabled"}</td>
        <td>{formatDate(user.createdAt)}</td>
      </tr>)}
      {rows.length === 0 && <tr><td colSpan={5} className="vp-empty-note">No users match this search.</td></tr>}
    </AdminTable>}
  </AdminOnly>;
}

export function AdminMerchants() { return <ApiAdminMerchants />; }

export function AdminTransactions() {
  const data = useSWR("admin-transactions", adminOperationsService.transactions);
  const [query, setQuery] = useState("");
  const rows = useMemo(() => (data.data?.items ?? []).filter((tx) =>
    `${tx.orderId} ${tx.id} ${tx.merchantName} ${tx.merchantId} ${tx.customerId} ${tx.paymentStatus}`.toLowerCase().includes(query.toLowerCase()),
  ), [data.data, query]);
  return <AdminOnly>
    <AdminHeading title="Transactions" description="Orders, payment state, and remaining refundable balances." />
    <ErrorNotice error={data.error} />
    <AdminSearch label="Search orders or parties" value={query} onChange={setQuery} />
    {data.isLoading && <p role="status">Loading transactions...</p>}
    {data.data && <AdminTable headers={["Order", "Merchant", "Customer", "Amount", "Refundable", "Payment", "Created"]}>
      {rows.map((tx) => <tr key={tx.id}>
        <td><strong>{tx.orderId}</strong><small>{tx.id} · PayPal {tx.paypalCaptureId ?? tx.paypalOrderId ?? "not linked"}</small></td>
        <td>{tx.merchantName}<small>{tx.merchantId}</small></td>
        <td>{tx.customerId}</td>
        <td>{formatMoney(tx.amountMinor, tx.currency)}</td>
        <td>{formatMoney(tx.refundableRemainingMinor, tx.currency)}</td>
        <td><AdminBadge>{tx.paymentStatus}</AdminBadge></td>
        <td>{formatDate(tx.createdAt)}</td>
      </tr>)}
      {rows.length === 0 && <tr><td colSpan={7} className="vp-empty-note">No transactions match this search.</td></tr>}
    </AdminTable>}
  </AdminOnly>;
}

export function AdminAi() {
  const data = useSWR("admin-ai-runs", adminOperationsService.aiRuns, { refreshInterval: 5000 });
  return <AdminOnly>
    <AdminHeading title="AI operations" description="AI runs and durable outbox job state recorded by Express." />
    <ErrorNotice error={data.error} />
    {data.isLoading && <p role="status">Loading AI operations...</p>}
    {data.data && <>
      <div className="vp-metrics-grid">
        {data.data.jobs.map((job) => <Panel key={job.state} title={job.state}><strong>{job.count}</strong><p className="vp-section-description">Outbox jobs</p></Panel>)}
        {!data.data.jobs.length && <Panel title="Outbox jobs"><p>No jobs have been recorded.</p></Panel>}
      </div>
      <AdminTable headers={["Run", "Purpose", "Case", "Actor", "Status", "Model", "Started"]}>
        {data.data.items.map((run) => <tr key={run.runId}>
          <td>{run.runId}<small>Input v{run.inputVersion} · {run.audience}</small></td>
          <td>{run.purpose}</td><td>{run.caseId ?? "Personal run"}</td><td>{run.actorId}</td>
          <td><AdminBadge>{run.status}</AdminBadge></td><td>{run.modelMode ?? "Pending result"}</td><td>{formatDate(run.createdAt)}</td>
        </tr>)}
        {!data.data.items.length && <tr><td colSpan={7} className="vp-empty-note">No AI runs have been recorded.</td></tr>}
      </AdminTable>
    </>}
  </AdminOnly>;
}

export function AdminRoles() {
  const data = useSWR("admin-roles", adminOperationsService.roles);
  return <AdminOnly>
    <AdminHeading title="Roles & permissions" description="Effective roles and permission grants from active and historical workspace memberships." />
    <ErrorNotice error={data.error} />
    {data.isLoading && <p role="status">Loading memberships...</p>}
    {data.data && <AdminTable headers={["Person", "Workspace", "Role", "Permissions", "Membership"]}>
      {data.data.items.map((membership) => <tr key={membership.membershipId}>
        <td>{membership.name}<small>{membership.email} · {membership.userId}</small></td>
        <td>{membership.workspaceName}<small>{membership.workspaceType} · {membership.workspaceId}</small></td>
        <td>{membership.role}</td>
        <td>{Array.isArray(membership.permissions) ? membership.permissions.join(", ") : String(membership.permissions)}</td>
        <td><AdminBadge>{membership.status}</AdminBadge></td>
      </tr>)}
      {!data.data.items.length && <tr><td colSpan={5} className="vp-empty-note">No workspace memberships have been recorded.</td></tr>}
    </AdminTable>}
  </AdminOnly>;
}

export function AdminAnalytics() {
  const data = useSWR("admin-analytics", adminOperationsService.analytics, { refreshInterval: 15000 });
  return <AdminOnly>
    <AdminHeading title="Analytics & reports" description="Live aggregate counts calculated from persisted VelaPal records." />
    <ErrorNotice error={data.error} />
    {data.isLoading && <p role="status">Loading operational metrics...</p>}
    {data.data && <>
      <div className="vp-metrics-grid">
        {Object.entries(data.data.totals).map(([label, count]) => <Panel key={label} title={label.replaceAll(/([A-Z])/g, " $1")}><strong>{count}</strong></Panel>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Cases by stage"><ul className="space-y-2">{data.data.casesByStage.map((item) => <li key={item.stage} className="flex justify-between"><span>{item.stage}</span><strong>{item.count}</strong></li>)}{!data.data.casesByStage.length && <li>No cases recorded.</li>}</ul></Panel>
        <Panel title="Transactions by payment status"><ul className="space-y-2">{data.data.transactionsByStatus.map((item) => <li key={item.status} className="flex justify-between"><span>{item.status}</span><strong>{item.count}</strong></li>)}{!data.data.transactionsByStatus.length && <li>No transactions recorded.</li>}</ul></Panel>
      </div>
    </>}
  </AdminOnly>;
}

export function AdminSettings() {
  const data = useSWR("admin-settings", adminOperationsService.settings, { refreshInterval: 30000 });
  return <AdminOnly>
    <AdminHeading title="System settings" description="Read-only service and integration readiness reported by the API." />
    <ErrorNotice error={data.error} />
    {data.isLoading && <p role="status">Checking service configuration...</p>}
    {data.data && <>
      <Panel title={data.data.service.name}>
        <p><AdminBadge>{data.data.service.status}</AdminBadge> · Contract {data.data.service.contractVersion}</p>
        <p className="vp-section-description">Last checked {formatDate(data.data.checkedAt)}. Secrets are never returned to the browser.</p>
      </Panel>
      <AdminTable headers={["Integration", "Readiness"]}>
        {Object.entries(data.data.integrations).map(([name, status]) => <tr key={name}><td>{name}</td><td><AdminBadge>{status}</AdminBadge></td></tr>)}
      </AdminTable>
    </>}
  </AdminOnly>;
}

export function AdminOverview({ caseCount, reviewCaseId }: { caseCount: number; reviewCaseId?: string }) {
  return <div className="vp-admin-page"><AdminHeading title="Operations overview" description="Live API case queue." /><p>{caseCount} open cases</p>{reviewCaseId && <p>Next case for review: {reviewCaseId}</p>}</div>;
}

export function AdminAuditPage() { return <AuditEvents />; }
