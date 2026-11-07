import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
export default function NotFound() {
  return (
    <PublicShell>
      <main className="vp-public-notice">
        <p className="vp-eyebrow">404 / PAGE NOT FOUND</p>
        <h1>This page has sailed out of view.</h1>
        <p>Check the address or return to your workspace.</p>
        <Link className="vp-button" href="/">
          Back to VelaPal
        </Link>
      </main>
    </PublicShell>
  );
}
