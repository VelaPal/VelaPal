"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Lock,
  Maximize2,
  Share2,
  ShieldAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { disputesService } from "@/services/contracts/disputes.service";
import type { EvidenceSource } from "@/services/contracts/types";
import { useSession } from "@/features/auth/session";
import { ErrorNotice, useAction } from "@/components/ui/workflow";

interface SourceProps {
  source: EvidenceSource;
  caseId: string;
  caseVersion: number;
  accessRevision: number;
  refresh: () => Promise<unknown>;
  onOpenPreview: (source: EvidenceSource) => void;
}

function Source({
  source: s,
  caseId,
  caseVersion,
  accessRevision,
  refresh,
  onOpenPreview,
}: SourceProps) {
  const { session } = useSession();
  const action = useAction();
  const [consent, setConsent] = useState(false);
  const [reason, setReason] = useState("");
  const [imageError, setImageError] = useState(false);

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

  const previewUrl =
    source.previewUrl ||
    `/api/v1/disputes/${caseId}/sources/${source.sourceId}/stream?v=${source.sourceVersion}`;

  const isImage =
    source.mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|svg)$/i.test(source.originalName);
  const isPdf =
    source.mime === "application/pdf" ||
    /\.pdf$/i.test(source.originalName);

  return (
    <li
      id={`source-${s.sourceId}`}
      className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all hover:border-slate-300"
    >
      {/* Header Info */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            {isImage ? (
              <ImageIcon className="size-4.5" />
            ) : isPdf ? (
              <FileText className="size-4.5 text-rose-500" />
            ) : (
              <FileText className="size-4.5" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-slate-900">
              {source.originalName}
            </h4>
            <p className="font-mono text-xs text-slate-500">
              {source.sourceId} · v{source.sourceVersion} · Party:{" "}
              <span className="font-sans font-medium text-slate-700">
                {source.ownerParty}
              </span>
            </p>
          </div>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Audience Badge */}
          {source.audience === "CASE_SHARED" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
              <Share2 className="size-3" /> Shared with Case
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
              <Lock className="size-3" /> Private
            </span>
          )}

          {/* Scan State Badge */}
          {source.scanState === "CLEAN" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              <CheckCircle2 className="size-3" /> Verified Clean
            </span>
          ) : source.scanState === "REJECTED" ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700">
              <ShieldAlert className="size-3" /> Rejected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              <Clock className="size-3 animate-spin" /> Scanning ({source.scanState})
            </span>
          )}
        </div>
      </div>

      <ErrorNotice error={result.error} />

      {/* Visual Preview Section */}
      <div className="mt-4">
        {source.scanState === "CLEAN" ? (
          isImage ? (
            <div className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition-all hover:border-blue-300">
              {/* Clickable Image Container */}
              <div
                onClick={() => onOpenPreview(source)}
                className="relative flex h-64 w-full cursor-zoom-in items-center justify-center p-2 select-none"
              >
                {!imageError ? (
                  <img
                    src={previewUrl}
                    alt={source.originalName}
                    className="max-h-full max-w-full rounded-lg object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-slate-400">
                    <ImageIcon className="size-10 text-slate-300" />
                    <p className="text-xs font-medium text-slate-600">
                      Evidence image preview is secured or loading.
                    </p>
                  </div>
                )}

                {/* Hover overlay hint */}
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20 opacity-0 backdrop-blur-2xs transition-opacity group-hover:opacity-100">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-md">
                    <Eye className="size-3.5 text-blue-600" /> Click to view full image
                  </span>
                </div>
              </div>

              {/* Bottom control bar */}
              <div className="flex items-center justify-between border-t border-slate-200/80 bg-white px-3.5 py-2 text-xs">
                <span className="font-mono text-[11px] text-slate-500">
                  {source.mime} · {source.locator || "image:1"}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenPreview(source)}
                    className="inline-flex items-center gap-1 font-medium text-blue-600 transition-colors hover:text-blue-800 cursor-pointer"
                  >
                    <Maximize2 className="size-3.5" /> Fullscreen
                  </button>
                  <span className="text-slate-300">·</span>
                  <a
                    href={previewUrl}
                    download={source.originalName}
                    className="inline-flex items-center gap-1 font-medium text-slate-700 transition-colors hover:text-slate-950"
                  >
                    <Download className="size-3.5" /> Download
                  </a>
                </div>
              </div>
            </div>
          ) : isPdf ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <FileText className="size-5.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {source.originalName}
                  </p>
                  <p className="text-xs text-slate-500">
                    PDF Document · Locator: {source.locator || "page:1"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                >
                  <ExternalLink className="size-3.5" /> Open PDF
                </a>
                <a
                  href={previewUrl}
                  download={source.originalName}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                >
                  <Download className="size-3.5" /> Download
                </a>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <FileText className="size-6 text-slate-400" />
                <span className="text-sm font-medium">{source.originalName}</span>
              </div>
              <a
                href={previewUrl}
                download={source.originalName}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"
              >
                <Download className="size-3.5" /> Download Document
              </a>
            </div>
          )
        ) : source.scanState === "REJECTED" ? (
          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-800">
            <AlertCircle className="size-5 shrink-0 text-rose-600" />
            <span>
              This file was rejected by safety verification (unsupported format or security policy check) and cannot be opened.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-4 text-xs text-amber-800">
            <Clock className="size-5 shrink-0 animate-spin text-amber-600" />
            <span>
              File is quarantined in verification. The preview will activate once scanning finishes.
            </span>
          </div>
        )}
      </div>

      {/* Metadata & Actions */}
      <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {source.sha256 ? (
            <span className="font-mono text-[11px] text-slate-500">
              SHA-256: {source.sha256.slice(0, 12)}…{source.sha256.slice(-6)}
            </span>
          ) : (
            <span className="text-slate-400">Digest computation pending</span>
          )}
        </div>
      </div>

      {/* Party Sharing Consent Actions */}
      {own && source.audience === "PRIVATE" && (
        <div className="mt-4 space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
          <label className="flex items-start gap-2.5 text-xs text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I consent to share this source version with both case parties (SHARE_SOURCE).
            </span>
          </label>
          <button
            className="vp-button text-xs py-2"
            disabled={
              action.busy ||
              !consent ||
              source.scanState !== "CLEAN" ||
              !binding
            }
            onClick={() =>
              void action.run(async () => {
                if (!binding) {
                  throw new Error(
                    "Refresh the case to obtain an active sharing consent binding.",
                  );
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
              }, "Source shared with case.")
            }
          >
            {action.busy ? "Sharing…" : "Share with case"}
          </button>
          {!binding && source.scanState === "CLEAN" && result.data && (
            <p className="text-[11px] text-amber-800">
              Refresh the case to obtain an active sharing consent binding.
            </p>
          )}
        </div>
      )}

      {/* Revoke Shared Access Form */}
      {own && source.audience === "CASE_SHARED" && (
        <form
          className="mt-4 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/50 p-4"
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
            }, "Source access revoked. Prior assessment and consents invalidated.");
          }}
        >
          <label className="vp-label text-xs">
            Reason for revoking access
            <input
              className="vp-input mt-1"
              required
              minLength={5}
              placeholder="e.g., Superseded by clearer document"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className="vp-secondary text-xs"
            disabled={action.busy || reason.trim().length < 5}
          >
            {action.busy ? "Revoking…" : "Revoke shared access"}
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
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [selectedPreviewSource, setSelectedPreviewSource] =
    useState<EvidenceSource | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Handle local file selection and local preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    if (selected && selected.type.startsWith("image/")) {
      const url = URL.createObjectURL(selected);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedPreviewSource(null);
      }
    };
    if (selectedPreviewSource) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPreviewSource]);

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      {canUpload && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <UploadCloud className="size-4.5 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Upload New Evidence
            </h3>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Uploaded files start private. Review scan status and audience before sharing. Accepted formats: JPEG, PNG, PDF (max 5 MB).
          </p>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                if (!file) throw new Error("Select a file first.");
                if (file.size > 5 * 1024 * 1024 || file.size === 0)
                  throw new Error("File size must be between 1 byte and 5 MB.");
                if (
                  !["image/jpeg", "image/png", "application/pdf"].includes(
                    file.type,
                  )
                )
                  throw new Error("File format must be JPG, PNG, or PDF.");

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
                setFilePreview(null);
                if (fileInput.current) fileInput.current.value = "";
                await refresh();
              }, "Uploaded privately. Safety scan is processing.");
            }}
          >
            {/* File Selected Preview */}
            {file && (
              <div className="flex items-center gap-3.5 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5">
                {filePreview ? (
                  <img
                    src={filePreview}
                    alt="Upload preview"
                    className="size-14 rounded-lg border border-blue-200 object-cover shadow-2xs"
                  />
                ) : (
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-white text-rose-500 shadow-2xs border border-blue-100">
                    <FileText className="size-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {(file.size / 1024).toFixed(1)} KB · Ready to upload privately
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFilePreview(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                  title="Remove selection"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50">
                <span>{file ? "Change File" : "Select Photo / Document..."}</span>
                <input
                  ref={fileInput}
                  className="hidden"
                  type="file"
                  required={!file}
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileChange}
                />
              </label>

              <button
                type="submit"
                className="vp-button text-xs py-2.5 px-4"
                disabled={action.busy || !file}
              >
                {action.busy ? "Uploading Evidence…" : "Upload Privately"}
              </button>
            </div>

            {action.feedback}
          </form>
        </div>
      )}

      {/* Sources List */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Case Evidence ({sources?.length || 0})
          </h3>
        </div>

        {sources && sources.length > 0 ? (
          <ul className="space-y-4">
            {sources.map((s) => (
              <Source
                key={s.sourceId}
                source={s}
                caseId={caseId}
                caseVersion={caseVersion}
                accessRevision={accessRevision}
                refresh={refresh}
                onOpenPreview={(src) => setSelectedPreviewSource(src)}
              />
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-10 text-center">
            <ImageIcon className="mb-2 size-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-700">
              No evidence uploaded yet
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Upload product photos, tracking receipts, or relevant documents above.
            </p>
          </div>
        )}
      </div>

      {/* Fullscreen Preview Lightbox Modal */}
      {selectedPreviewSource && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setSelectedPreviewSource(null)}
        >
          <div
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <ImageIcon className="size-4.5" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">
                    {selectedPreviewSource.originalName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedPreviewSource.mime} · ID: {selectedPreviewSource.sourceId} · v{selectedPreviewSource.sourceVersion}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={
                    selectedPreviewSource.previewUrl ||
                    `/api/v1/disputes/${caseId}/sources/${selectedPreviewSource.sourceId}/stream?v=${selectedPreviewSource.sourceVersion}`
                  }
                  download={selectedPreviewSource.originalName}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                >
                  <Download className="size-3.5" />
                  <span>Download File</span>
                </a>
                <button
                  type="button"
                  onClick={() => setSelectedPreviewSource(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4 min-h-[360px]">
              <img
                src={
                  selectedPreviewSource.previewUrl ||
                  `/api/v1/disputes/${caseId}/sources/${selectedPreviewSource.sourceId}/stream?v=${selectedPreviewSource.sourceVersion}`
                }
                alt={selectedPreviewSource.originalName}
                className="max-h-[72vh] w-auto max-w-full rounded-lg object-contain shadow-md"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
              <span className="font-mono text-[11px]">
                SHA-256: {selectedPreviewSource.sha256 || "Digest unavailable"}
              </span>
              <span>
                Owner Party:{" "}
                <strong className="text-slate-700">
                  {selectedPreviewSource.ownerParty}
                </strong>{" "}
                · Audience:{" "}
                <strong className="text-slate-700">
                  {selectedPreviewSource.audience}
                </strong>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
