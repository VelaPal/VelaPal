import type { ReactNode } from "react";
import AppShell from "@/components/layout/app-shell";
import { ProtectedWorkspace } from "@/features/auth/session";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  return (
    <ProtectedWorkspace>
      <AppShell>{children}</AppShell>
    </ProtectedWorkspace>
  );
}
