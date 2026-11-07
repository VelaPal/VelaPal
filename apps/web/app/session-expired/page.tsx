import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
export default function SessionExpired() {
  return (
    <PublicShell>
      <main className="vp-public-notice">
        <p className="vp-eyebrow">SESSION RECOVERY</p>
        <h1>Your session has expired.</h1>
        <p>
          Sign in again to continue. Review any pending operation using its
          existing reference before submitting another action.
        </p>
        <Link className="vp-button" href="/login">
          Sign in again
        </Link>
      </main>
    </PublicShell>
  );
}
