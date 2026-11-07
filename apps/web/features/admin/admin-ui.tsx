"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Download, Search, ShieldCheck, X } from "lucide-react";
import { useAdminPreview } from "./use-admin-preview";
import type { PreviewAction } from "./admin-preview";
export function AdminHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="vp-page-heading">
      <div>
        <p className="vp-eyebrow">VELAPAL OPERATIONS</p>
        <h1>{title}</h1>
        <p className="vp-admin-description">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function AdminNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="vp-admin-notice">
      <ShieldCheck size={17} />
      <span>{children}</span>
    </p>
  );
}
export function AdminTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="vp-admin-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={`${headers[0]} records`}
    >
      <table className="vp-admin-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function AdminSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="vp-admin-search">
      <Search size={17} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={label}
      />
    </label>
  );
}
export function AdminBadge({ children }: { children: string }) {
  return (
    <span
      className={`vp-admin-badge ${["Active", "Approved", "Available", "Verified", "Paid"].includes(children) ? "is-green" : ["Pending", "Suspended", "Paused", "Needs human review"].includes(children) ? "is-amber" : children === "Rejected" ? "is-red" : ""}`}
    >
      {children}
    </span>
  );
}
export function PreviewUnavailable() {
  return (
    <AdminNotice>
      This frontend preview uses fictional records in mock mode. Live
      administration will use the confirmed backend integration.
    </AdminNotice>
  );
}
export function AdminDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => {
        if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="vp-admin-dialog"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <button
        className="vp-icon-button vp-admin-dialog-close"
        aria-label="Close dialog"
        onClick={onClose}
      >
        <X size={19} />
      </button>
      <p className="vp-eyebrow">REVIEW YOUR NEXT STEP</p>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
export function AdminConfirm({
  title,
  description,
  target,
  action,
  onClose,
  onSuccess,
}: {
  title: string;
  description: string;
  target: string;
  action: PreviewAction;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const preview = useAdminPreview();
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState("");
  return (
    <AdminDialog title={title} onClose={onClose}>
      <p className="vp-admin-dialog-copy">{description}</p>
      <dl className="vp-admin-review">
        <div>
          <dt>Target</dt>
          <dd>{target}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>Local demo only</dd>
        </div>
      </dl>
      <form
        className="vp-auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reviewed) return;
          try {
            preview.commit(action, reason, code);
            onSuccess?.();
            onClose();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not save this preview.",
            );
          }
        }}
      >
        <label className="vp-label">
          Reason for this action
          <textarea
            className="vp-input"
            rows={3}
            minLength={10}
            maxLength={1000}
            required
            placeholder="Describe why this change is needed."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label className="vp-label">
          Verify with authenticator code
          <input
            className="vp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            placeholder="Demo code: 123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <p className="vp-form-note">
          Demo code: 123456. This simulates verification for the local preview.
        </p>
        <label className="vp-consent-label">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          <span>
            I reviewed the target and consequences. Record my decision in the
            demo audit trail.
          </span>
        </label>
        {error && (
          <p role="alert" className="vp-field-error">
            {error}
          </p>
        )}
        <div className="vp-intake-actions">
          <button type="button" className="vp-secondary" onClick={onClose}>
            Go back
          </button>
          <button
            className="vp-button"
            disabled={
              !preview.enabled ||
              reason.trim().length < 10 ||
              code.length !== 6 ||
              !reviewed
            }
          >
            {title}
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
export function exportCsv(name: string, headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let v = String(value ?? "");
    if (/^[=+@\-\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replaceAll('"', '""') + '"';
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ExportButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button className="vp-secondary" onClick={onClick}>
      <Download size={14} />
      {label}
    </button>
  );
}
