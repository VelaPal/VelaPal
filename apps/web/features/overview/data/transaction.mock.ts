import type{TransactionDetail, TransactionStatus} from "@/features/transactions/types"; 

function createTransaction(id: string, title:string, amountCents: number, status: TransactionStatus, createdAt: string): TransactionDetail {
    const providerReferences: TransactionDetail["providerReferences"] = [
        {
            type:"ORDER", 
            id : `MOCK-ORDER-${id}`
        }
    ];

    if (status === "PAID" || status === "REFUNDED") { 

        providerReferences.push({
            type:"CAPTURE",
            id : `MOCK-CAPTURE-${id}`
        });
    } 

    if (status === "REFUNDED") { 
        providerReferences.push({
            type:"REFUND",
            id : `MOCK-REFUND-${id}`
        });
    }

    return {
    id,
    title,
    merchantName: "Vela Store",
    amountCents,
    currency: "USD",
    status,
    createdAt,
    snapshot: {
      productName: title,
      description: "Purchase details recorded when checkout was approved.",
      quantity: 1,
      unitPriceCents: amountCents,
      termsVersion: "2026-01",
      approvedAt: createdAt,
    },
    providerReferences,
    activeCaseId: id === "VP-TX-1002" ? "VP-CASE-0001" : null,
  };
}

export const transactionsMock: TransactionDetail[] = [
  createTransaction(
    "VP-TX-1008", "Creator Toolkit", 4900,
    "UNKNOWN", "2026-11-02T10:00:00Z",
  ),
  createTransaction(
    "VP-TX-1007", "Research API Credits", 1500,
    "PENDING", "2026-11-02T09:30:00Z",
  ),
  createTransaction(
    "VP-TX-1006", "Vela Membership", 1900,
    "FAILED", "2026-11-02T09:00:00Z",
  ),
  createTransaction(
    "VP-TX-1005", "Research API Credits — Custom Pack", 2700,
    "PAID", "2026-11-02T08:30:00Z",
  ),
  createTransaction(
    "VP-TX-1004", "Vela Membership", 1900,
    "PAID", "2026-11-02T08:00:00Z",
  ),
  createTransaction(
    "VP-TX-1003", "Research API Credits — Starter Pack", 2900,
    "PAID", "2026-11-01T15:00:00Z",
  ),
  createTransaction(
    "VP-TX-1002", "Creator Toolkit", 4900,
    "PAID", "2026-11-01T12:00:00Z",
  ),
  createTransaction(
    "VP-TX-1001", "Creator Toolkit", 4900,
    "REFUNDED", "2026-10-30T10:00:00Z",
  ),
];
