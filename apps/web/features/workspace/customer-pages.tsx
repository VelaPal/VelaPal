"use client";

import { useSession } from "@/features/auth/session";
import {
  ApiSubscriptions,
  ApiDigitalLibrary,
  ApiNotifications,
  ApiCustomerSettings,
  ApiMerchantApplication,
} from "./customer-api-pages";

export function Subscriptions() {
  const { session } = useSession();
  return <ApiSubscriptions seller={session?.activeWorkspace.type === "SELLER"} />;
}

export function DigitalLibrary() {
  return <ApiDigitalLibrary />;
}

export function Notifications() {
  const { session } = useSession();
  const role = session?.activeWorkspace.type === "SELLER" ? "SELLER" : "CUSTOMER";
  return <ApiNotifications role={role} />;
}

export function CustomerSettings() {
  return <ApiCustomerSettings />;
}

export function MerchantApplication() {
  return <ApiMerchantApplication />;
}
