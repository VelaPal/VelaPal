import type { OverviewSummaryData } from "@/features/overview/types";

export const overviewMock = {
  monthlySpendCents: 12400,
  currency: "USD",
  activeSubscriptions: 3,
  pendingApprovals: 2,
  openCases: 1,
} satisfies OverviewSummaryData;