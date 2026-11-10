"use client";
import { useState } from "react";
import { AdminDialog, AdminNotice } from "@/features/admin/admin-ui";
import { Panel } from "@/components/ui/workflow";
import type { DisputeDetail } from "@/services/contracts/types";
export default function OfficialHandoff({ detail }: { detail: DisputeDetail }) {
  const [open, setOpen] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [done, setDone] = useState(false);
  const shared = (detail.sources ?? []).filter(
    (s) => s?.audience === "CASE_SHARED",
  );
  return (
    <Panel title="Official channel handoff">
      <p className="vp-section-description">
        Prepare the references for review when a provider action is unavailable.
        This does not open or submit an official PayPal case.
      </p>
      <button
        className="vp-secondary"
        onClick={() => {
          setReviewed(false);
          setOpen(true);
        }}
      >
        Review handoff checklist
      </button>
      {done && (
        <p className="vp-form-note" role="status">
          Checklist reviewed locally. Nothing was submitted or shared with the
          provider.
        </p>
      )}
      {open && (
        <AdminDialog
          key={`${detail.case.caseVersion}:${detail.case.accessRevision}`}
          title="Prepared handoff · not submitted"
          onClose={() => setOpen(false)}
        >
          <dl className="vp-admin-review">
            <div>
              <dt>Internal case</dt>
              <dd>
                {detail.case.id} · v{detail.case.caseVersion}
              </dd>
            </div>
            <div>
              <dt>Linked transaction</dt>
              <dd>{detail.case.transactionId ?? detail.case.orderId}</dd>
            </div>
            <div>
              <dt>Official provider case</dt>
              <dd>
                {detail.case.officialPaypalDisputeId ??
                  "No official case linked"}
              </dd>
            </div>
            <div>
              <dt>Provider operation</dt>
              <dd>
                {detail.providerOperation?.operationId ?? "Not submitted"} ·{" "}
                {detail.providerOperation?.status ?? "Unknown"}
              </dd>
            </div>
          </dl>
          <p className="vp-form-note">
            Shared source references only. Private or revoked sources are
            excluded.
          </p>
          <ul className="vp-admin-trace">
            {shared.map((s) => (
              <li key={s.sourceId}>
                {s.originalName} · {s.sourceId} · v{s.sourceVersion} ·{" "}
                {s.locator ?? "Locator not supplied"}
              </li>
            ))}
          </ul>
          <AdminNotice>
            Check the official provider record, permitted actions, ownership and
            deadline separately. No external upload, payment action or
            authorized export is available here.
          </AdminNotice>
          <label className="vp-consent-label">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed these references and understand that this checklist
            submits nothing.
          </label>
          <div className="vp-intake-actions">
            <button className="vp-secondary" onClick={() => setOpen(false)}>
              Go back
            </button>
            <button
              className="vp-button"
              disabled={!reviewed}
              onClick={() => {
                setDone(true);
                setOpen(false);
              }}
            >
              Mark checklist reviewed
            </button>
          </div>
        </AdminDialog>
      )}
    </Panel>
  );
}
