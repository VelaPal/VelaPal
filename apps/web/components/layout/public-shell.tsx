import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Brand from "./brand";
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="vp-public-shell">
      <header className="vp-public-header">
        <Brand href="/" />
        <div className="vp-public-header-actions">
          <span className="vp-public-status">
            {process.env.NEXT_PUBLIC_API_MODE === "api"
              ? "VelaPal account"
              : "VelaPal Demo Experience"}
          </span>
          <Link href="/login" className="vp-link">
            Sign in
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </header>
      {children}
      <footer className="vp-public-footer">
        <span>
          © 2026 VelaPal
          {process.env.NEXT_PUBLIC_API_MODE !== "api"
            ? " · Fictional demo data"
            : ""}
        </span>
        <nav aria-label="Public information">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}
