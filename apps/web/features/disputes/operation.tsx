"use client";
import { useRef } from "react";
import useSWR from "swr";
import { operationsService } from "@/services/contracts/operations.service";
import { useSession } from "@/features/auth/session";
import { Badge, ErrorNotice, useAction } from "@/components/ui/workflow";
import { formatMoney } from "@/lib/format";
export default function OperationTracker({
  operationId,
}: {
  operationId: string;
}) {
  const { session } = useSession();
  const key = useRef<string>("");
  const action = useAction();
  const op = useSWR(
    [session?.activeWorkspace.id, "operation", operationId],
    () => operationsService.get(operationId),
    { refreshInterval: (d) => (d?.status === "PENDING" ? 2500 : 0) },
  );
  return (
    <div className="space-y-3 text-sm">
      <ErrorNotice error={op.error} />
      {!op.data && !op.error && <p role="status">Loading operation…</p>}
      {op.data && (
        <>
          <p className="break-all font-medium">{op.data.operationId}</p>
          <Badge>{op.data.status}</Badge>
          <p>
            {formatMoney(op.data.amountMinor, op.data.currency)} ·{" "}
            {op.data.type}
          </p>
          <p>{op.data.nextStep}</p>
          {op.data.status === "UNKNOWN" && (
            <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
              The provider outcome is unknown. Reconcile this existing
              operation; do not execute another payment or refund.
            </p>
          )}
          {["UNKNOWN", "PENDING", "FAILED", "UNAVAILABLE"].includes(
            op.data.status,
          ) && (
            <button
              className="vp-secondary"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  key.current ||= crypto.randomUUID();
                  await operationsService.reconcile(operationId, key.current);
                  await op.mutate();
                }, "Existing operation checked. Read the returned status; no new execution was created.")
              }
            >
              Reconcile existing operation
            </button>
          )}
          <p className="text-xs text-slate-500">
            Provider reference: {op.data.providerRef ?? "Not verified"} ·
            Verified: {op.data.verifiedAt ?? "Not verified"}
          </p>
        </>
      )}
      {action.feedback}
    </div>
  );
}
