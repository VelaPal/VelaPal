"use client";
import { useSession } from "@/features/auth/session";
import { CustomerSettings } from "@/features/workspace/customer-pages";
import { SellerSettings } from "@/features/workspace/seller-pages";
import Link from "next/link";
export default function Page() {
  const { session } = useSession();
  return session?.activeWorkspace.type === "ADMIN" ? (
    <Link href="/workspace/admin/settings">Open Admin settings</Link>
  ) : session?.activeWorkspace.type === "SELLER" ? (
    <SellerSettings />
  ) : (
    <CustomerSettings />
  );
}
