import type { ReactNode } from "react";
import Sidebar from "./sidebar";
import WorkspaceControls from "./workspace-controls";
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="vp-app-shell">
      <a className="vp-skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar />
      <div className="vp-workspace-body">
        <WorkspaceControls />
        <main id="main-content" className="vp-main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="vp-workspace-footer">
          <span>© 2026 VelaPal</span>
          <span>
            Your money, in your hands. <i aria-hidden="true" />{" "}
            VelaPal workspace
          </span>
          <span>Always your decision.</span>
        </footer>
      </div>
    </div>
  );
}
