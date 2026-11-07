"use client";
import { useSession } from "@/features/auth/session";
import { Assistant } from "@/features/agent/assistant";
import { SellerAssistant } from "@/features/workspace/seller-pages";
export default function Page() {
  const { session } = useSession();
  return session?.activeWorkspace.type === "SELLER" ? (
    <SellerAssistant />
  ) : (
    <Assistant />
  );
}
