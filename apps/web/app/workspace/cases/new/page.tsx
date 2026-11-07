import CreateCase from "@/features/disputes/create-case";
export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ transactionId?: string | string[] }>;
}) {
  const { transactionId } = await searchParams;
  return (
    <CreateCase
      initialTransaction={
        typeof transactionId === "string" ? transactionId : ""
      }
    />
  );
}
