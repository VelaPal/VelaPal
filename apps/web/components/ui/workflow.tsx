"use client";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ApiError } from "@/services/contracts/api-client";
import { authService } from "@/services/contracts/auth.service";

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="vp-panel">
      <h2 className="vp-panel-title">{title}</h2>
      {children}
    </section>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="vp-badge">{children}</span>;
}
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const tips: Record<number, string> = {
    401: "Your session expired. Sign in again.",
    403: "This workspace does not have permission, or step-up verification is required.",
    409: "Refresh the latest data and review changes before submitting again.",
    422: "Check the form fields.",
    429: "Too many requests. Wait before trying again.",
    503: "The service is temporarily unavailable. Try again later.",
    501: "This operation is unavailable in the mock. No money has moved.",
  };
  const duplicate =
    error instanceof ApiError && error.fieldErrors.existingCaseId;
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {error instanceof ApiError && (
        <>
          <p className="mt-2">
            {error.code === "INVALID_ORIGIN"
              ? "Open VelaPal at http://localhost:3000 and retry. Restart npm run dev after environment changes."
              : tips[error.status]}
          </p>
          <p className="mt-2 break-all text-xs">
            {error.code}
            {error.currentVersion !== undefined &&
              ` · Current version ${error.currentVersion}`}
            {error.traceId && ` · Trace ${error.traceId}`}
          </p>
          {Object.entries(error.fieldErrors)
            .filter(([k]) => k !== "existingCaseId")
            .map(([k, v]) => (
              <p key={k}>
                {k}: {String(v)}
              </p>
            ))}
        </>
      )}
      {typeof duplicate === "string" && (
        <Link className="vp-link" href={`/workspace/cases/${duplicate}`}>
          Open existing case
        </Link>
      )}
    </div>
  );
}
export function useAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  async function run(
    fn: () => Promise<unknown>,
    success = "Saved. Latest data loaded.",
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await fn();
      setNotice(success);
    } catch (e) {
      setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    run,
    feedback: (
      <>
        <ErrorNotice error={error} />
        {notice && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {notice}
          </p>
        )}
      </>
    ),
  };
}
export function MfaStepUp({
  purpose,
  targetId,
  onVerified,
}: {
  purpose:
    | "ADMIN_INTERVENTION"
    | "ADMIN_APPROVAL"
    | "MERCHANT_EXECUTION"
    | "WORKSPACE_SWITCH";
  targetId: string;
  onVerified: (id: string) => Promise<unknown>;
}) {
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const action = useAction();
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="text-sm">
        Verify MFA for this action and target.{" "}
        {process.env.NEXT_PUBLIC_API_MODE !== "api" && "Mock code: 123456."}
      </p>
      {!challenge ? (
        <button
          type="button"
          className="vp-button"
          disabled={action.busy}
          onClick={() =>
            void action.run(async () => {
              const r = await authService.createMfaChallenge(purpose, targetId);
              setChallenge(r.challengeId);
            }, "MFA challenge created.")
          }
        >
          Start MFA step-up
        </button>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const r = await authService.verifyMfa(challenge, code);
              if (r.status !== "STEP_UP_VERIFIED")
                throw new Error("Step-up verification required");
              setChallenge("");
              setCode("");
              await onVerified(r.stepUpId);
            }, "Verified action recorded.");
          }}
        >
          <label className="vp-label">
            MFA code
            <input
              className="vp-input"
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="vp-button" disabled={action.busy}>
            Verify and submit
          </button>
        </form>
      )}
      {action.feedback}
    </div>
  );
}
