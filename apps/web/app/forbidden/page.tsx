import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
export default function Forbidden() {
  return (
    <PublicShell>
      <main className="vp-public-notice">
        <p className="vp-eyebrow">ACCESS DENIED</p>
        <h1>This workspace needs permission.</h1>
        <p>
          Choose a workspace granted to your account or ask an authorized
          administrator to review access.
        </p>
        <Link className="vp-button" href="/workspace">
          Back to your workspace
        </Link>
      </main>
    </PublicShell>
  );
}
