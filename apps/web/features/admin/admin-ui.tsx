"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Search, ShieldCheck, X } from "lucide-react";

export function AdminHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="vp-page-heading"><div><p className="vp-eyebrow">VELAPAL OPERATIONS</p><h1>{title}</h1><p className="vp-admin-description">{description}</p></div>{action}</header>;
}
export function AdminNotice({ children }: { children: ReactNode }) {
  return <p role="status" className="vp-admin-notice"><ShieldCheck size={17}/><span>{children}</span></p>;
}
export function AdminTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="vp-admin-table-wrap" tabIndex={0} role="region" aria-label={`${headers[0]} records`}><table className="vp-admin-table"><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function AdminSearch({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <label className="vp-admin-search"><Search size={17}/><input value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} placeholder={label}/></label>;
}
export function AdminBadge({ children }: { children: string }) {
  const tone = ["Active", "Approved", "Available", "Verified", "Paid", "PUBLISHED"].includes(children) ? "is-green" : ["Pending", "Suspended", "Paused", "Needs human review"].includes(children) ? "is-amber" : children === "Rejected" ? "is-red" : "";
  return <span className={`vp-admin-badge ${tone}`}>{children}</span>;
}
export function AdminDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => { dialog?.close(); queueMicrotask(() => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); }); };
  }, []);
  return <dialog ref={ref} className="vp-admin-dialog" aria-labelledby={id} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><button className="vp-icon-button vp-admin-dialog-close" aria-label="Close dialog" onClick={onClose}><X size={19}/></button><p className="vp-eyebrow">REVIEW YOUR NEXT STEP</p><h2 id={id}>{title}</h2>{children}</dialog>;
}
