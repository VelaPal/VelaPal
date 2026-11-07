import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
export default function Privacy() {
  return (
    <PublicShell>
      <main className="vp-public-notice">
        <p className="vp-eyebrow">PROTOTYPE NOTICE</p>
        <h1>Demo privacy notice</h1>
        <p>
          Use fictional names and email addresses. Registration preview details
          are stored in this browser tab&apos;s session storage. Passwords are
          validated and discarded; they are never stored or sent by this
          registration preview.
        </p>
        <p>
          Closing the tab clears its registration preview. Signed-in demo
          sessions use the existing mock API and its session cookies. Do not
          upload sensitive documents to the prototype.
        </p>
        <Link className="vp-link" href="/register">
          Back to create account
        </Link>
      </main>
    </PublicShell>
  );
}
