import TransactionDetail from "@/features/transactions/components/transaction-detail";

type TransactionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function TransactionPage({
  params,
}: TransactionPageProps) {
  const { id } = await params;
  return <TransactionDetail transactionId={id} />;
}
