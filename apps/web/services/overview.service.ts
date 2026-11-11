import { transactionsService } from "@/services/contracts/transactions.service";
import { disputesService } from "@/services/contracts/disputes.service";
import { workspaceService } from "@/services/contracts/workspace.service";
import type { OverviewSummaryData } from "@/features/overview/types";

/** Build the overview from records returned by the Express API. */
export async function getOverviewSummary(): Promise<OverviewSummaryData> {
  const [transactions, cases, subscriptions] = await Promise.all([
    transactionsService.list(),
    disputesService.list(),
    workspaceService.subscriptions(),
  ]);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

  return {
    monthlySpendCents: transactions.items
      .filter((transaction) => {
        if (transaction.paymentStatus !== "PAID" || !transaction.verifiedAt)
          return false;
        const verifiedAt = Date.parse(transaction.verifiedAt);
        return verifiedAt >= monthStart && verifiedAt < nextMonthStart;
      })
      .reduce((total, transaction) => total + transaction.amountMinor, 0),
    currency: "USD",
    activeSubscriptions: subscriptions.items.filter((item) =>
      ["ACTIVE", "APPROVED"].includes(item.status),
    ).length,
    pendingApprovals: cases.items.filter((item) => item.stage === "AWAITING_CONSENT").length,
    openCases: cases.items.filter(
      (item) => !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(item.stage),
    ).length,
  };
}
