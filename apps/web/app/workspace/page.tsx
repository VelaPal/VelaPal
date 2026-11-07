import WorkspaceDashboard from "@/features/overview/components/workspace-dashboard";
// The client-side session guard renders this page only after session recovery.
export const instant = false;

export default function OverviewPage() {
  return <WorkspaceDashboard />;
}
