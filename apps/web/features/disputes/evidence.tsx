"use client";
import { useRef, useState } from "react";
import useSWR from "swr";
import { disputesService } from "@/services/contracts/disputes.service";
import type { EvidenceSource } from "@/services/contracts/types";
import { useSession } from "@/features/auth/session";
import { Badge, ErrorNotice, useAction } from "@/components/ui/workflow";

function Source({
  source: s,
  caseId,
  caseVersion,
  accessRevision,
  refresh,
}: {
  source: EvidenceSource;
  caseId: string;
  caseVersion: number;
  accessRevision: number;
  refresh: () => Promise<unknown>;
}) {
  const { session } = useSession();
  const action = useAction();
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const result = useSWR(
    [
      session?.activeWorkspace.id,
      caseId,
      caseVersion,
      accessRevision,
      "source",
      s.sourceId,
      s.sourceVersion,
    ],
    () => disputesService.getSource(caseId, s.sourceId),
    {
      refreshInterval: (d) =>
        d && ["SCANNING", "QUARANTINED"].includes(d.scanState) ? 1500 : 0,
    },
  );
  const source = result.data ?? s;
  const own = source.ownerParty === session?.activeWorkspace.type;
  const binding =
    result.data?.caseVersion === caseVersion &&
    result.data?.accessRevision === accessRevision &&
    result.data?.sourceVersion === source.sourceVersion
      ? result.data.shareParamsHash
      : null;
  return (
    <li
      id={`source-${s.sourceId}`}
      className="scroll-mt-20 space-y-3 rounded-xl border border-slate-200 p-4"
    >
      <p className="break-words font-medium">{source.originalName}</p>
      <p className="break-all text-xs text-slate-500">
        {source.sourceId} · v{source.sourceVersion} · {source.ownerParty}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge>{source.audience}</Badge>
        <Badge>{source.scanState}</Badge>
      </div>
      <ErrorNotice error={result.error} />
      {source.locator && (
        <p className="text-xs">Source locator: {source.locator}</p>
      )}
      <p className="text-xs text-slate-500">
        File contents are available only through the authorized API download flow.
      </p>
      {own && source.audience === "PRIVATE" && (
        <>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I consent to share this source version with both case parties
            (SHARE_SOURCE).
          </label>
          <button
            className="vp-button"
            disabled={
              action.busy ||
              !consent ||
              source.scanState !== "CLEAN" ||
              !binding
            }
            onClick={() =>
              void action.run(async () => {
                if (!binding) {
                  throw new Error("Refresh the case to load a current sharing consent binding.");
                }
                await disputesService.shareSource(
                  caseId,
                  source.sourceId,
                  source.sourceVersion,
                  "CASE_SHARED",
                  binding,
                );
                setConsent(false);
                await result.mutate();
                await refresh();
              }, "Source shared. Previous assessment and consents must be reviewed.")
            }
          >
            Share with case
          </button>
          {!binding && source.scanState === "CLEAN" && result.data && (
            <p className="text-xs text-amber-800">
              Refresh the case to get a current sharing consent binding.
            </p>
          )}
        </>
      )}
      {own && source.audience === "CASE_SHARED" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              await disputesService.revokeSource(
                caseId,
                source.sourceId,
                source.sourceVersion,
                reason,
              );
              await refresh();
            }, "Source revoked. Previous assessment and consents invalidated.");
          }}
        >
          <label className="vp-label">
            Reason for revoking access
            <input
              className="vp-input"
              required
              minLength={5}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="vp-secondary" disabled={action.busy}>
            Revoke shared access
          </button>
        </form>
      )}
      {action.feedback}
    </li>
  );
}
export default function Evidence({
  sources,
  caseId,
  refresh,
  canUpload,
  caseVersion,
  accessRevision,
}: {
  sources: EvidenceSource[];
  caseId: string;
  refresh: () => Promise<unknown>;
  canUpload: boolean;
  caseVersion: number;
  accessRevision: number;
}) {
  const action = useAction();
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Uploads start private. Review the file, scan status and audience before
        sharing. Maximum 10 MiB.
      </p>
      {canUpload && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              if (!file) throw new Error("Select a file");
              if (file.size > 10 * 1024 * 1024 || file.size === 0)
                throw new Error("Choose a file between 1 byte and 10 MiB");
              if (
                !["image/jpeg", "image/png", "application/pdf"].includes(
                  file.type,
                )
              )
                throw new Error("Choose a PDF, PNG or JPEG");
              const i = await disputesService.uploadIntent(caseId, {
                mime: file.type,
                byteCount: file.size,
                originalName: file.name,
              });
              await disputesService.uploadBytes(i.uploadHandle, file);
              await disputesService.finalize(
                caseId,
                i.sourceId,
                i.uploadId,
                i.sourceVersion,
              );
              setFile(null);
              if (fileInput.current) fileInput.current.value = "";
              await refresh();
            }, "Uploaded privately. Simulated scan is processing.");
          }}
        >
          <label className="vp-label">
            Evidence file
            <input
              ref={fileInput}
              className="vp-input"
              type="file"
              required
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button className="vp-button" disabled={action.busy || !file}>
            {action.busy ? "Uploading…" : "Upload privately"}
          </button>
          {action.feedback}
        </form>
      )}
      <ul className="space-y-4">
        {sources?.map((s) => (
          <Source
            key={s.sourceId}
            source={s}
            caseId={caseId}
            caseVersion={caseVersion}
            accessRevision={accessRevision}
            refresh={refresh}
          />
        ))}
      </ul>
      {!sources?.length && (
        <p className="text-sm text-slate-500">
          No evidence is visible to your workspace.
        </p>
      )}
    </div>
  );
}
