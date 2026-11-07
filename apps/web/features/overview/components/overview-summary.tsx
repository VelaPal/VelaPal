import StatCard from "@/components/ui/stat-card";
import type { OverviewSummaryData } from "@/features/overview/types";

type OverviewSummaryProps = {
  summary: OverviewSummaryData;
};

export default function OverviewSummary({
  summary,
}: OverviewSummaryProps) {
  const spending = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: summary.currency,
  }).format(summary.monthlySpendCents / 100);

  const cards = [
    {
      id: "spending",
      label: "Monthly spending",
      value: spending,
      description: "Paid through VelaPal this month",
    },
    {
      id: "subscriptions",
      label: "Active subscriptions",
      value: String(summary.activeSubscriptions),
      description: "Subscriptions managed in VelaPal",
    },
    {
      id: "approvals",
      label: "Awaiting approval",
      value: String(summary.pendingApprovals),
      description: "Purchases waiting for your decision",
    },
    {
      id: "cases",
      label: "Open cases",
      value: String(summary.openCases),
      description: "Disputes currently in progress",
    },
  ];

  return (
    <section aria-labelledby="summary-title">
      <h2 id="summary-title" className="sr-only">
        Account summary
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.id}
            label={card.label}
            value={card.value}
            description={card.description}
          />
        ))}
      </div>
    </section>
  );
}