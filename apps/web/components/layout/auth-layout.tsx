import type { ReactNode } from "react";
import Image from "next/image";
import { PublicShell } from "./public-shell";
export function AuthStory() {
  return (
    <aside className="vp-auth-story">
      <div>
        <p className="vp-eyebrow">THOUGHTFUL HELP. FULL CONTROL.</p>
        <h2>
          Room for a little
          <br />
          peace of mind.
        </h2>
        <p>
          Your purchases, renewals, and resolutions.
          <br />
          Connected by the context that matters.
        </p>
      </div>
      <div className="vp-auth-story-bottom">
        <div className="vp-story-orbit">
          <Image
            src="/velapal-logo.png"
            alt="VelaPal sail"
            width={110}
            height={110}
          />
        </div>
        <p>
          “Always your decision”
          <br />
          <span>is how we build every next step.</span>
        </p>
        <span className="vp-story-line" />
        <small>ONE PLATFORM · THREE PURPOSEFUL WORKSPACES</small>
      </div>
    </aside>
  );
}
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <PublicShell>
      <main className="vp-auth-layout">
        <AuthStory />
        <div className="vp-auth-card">{children}</div>
      </main>
    </PublicShell>
  );
}
