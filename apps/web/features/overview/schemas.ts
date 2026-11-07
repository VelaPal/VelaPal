import { z } from "zod";

export const overviewSummarySchema = z.object({
  monthlySpendCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  activeSubscriptions: z.number().int().nonnegative(),
  pendingApprovals: z.number().int().nonnegative(),
  openCases: z.number().int().nonnegative(),
});

export const dashboardResponseSchema = z.object({
  summary: overviewSummarySchema,
});

export type OverviewSummaryData = z.infer<
  typeof overviewSummarySchema
>;