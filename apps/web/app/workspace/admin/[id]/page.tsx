import { AdminInvestigation } from "@/features/admin/admin-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminInvestigation caseId={id} />;
}
