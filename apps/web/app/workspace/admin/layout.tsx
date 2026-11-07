"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useSession } from "@/features/auth/session";
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { session } = useSession();
  if (session?.activeWorkspace.type !== "ADMIN")
    return (
      <div role="alert">
        <p>Admin workspace access required.</p>
        <Link className="vp-link" href="/workspace">
          Back to your workspace
        </Link>
      </div>
    );
  return children;
}
