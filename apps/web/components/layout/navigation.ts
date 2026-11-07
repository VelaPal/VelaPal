import {
  ArrowLeftRight,
  BookOpen,
  LayoutDashboard,
  Scale,
  ShoppingBag,
  Repeat2,
  Sailboat,
  Users,
  Store,
  Activity,
  ChartNoAxesCombined,
  KeyRound,
  Settings2,
  Bell,
  Package,
  type LucideIcon,
} from "lucide-react";
import type { WorkspaceType } from "@/services/contracts/types";
export type NavigationItem = { label: string; href: string; icon: LucideIcon };
export function workspaceNavigation(role?: WorkspaceType): NavigationItem[] {
  const overview = {
    label: "Overview",
    href: "/workspace",
    icon: LayoutDashboard,
  };
  if (role === "ADMIN")
    return [
      overview,
      { label: "Users", href: "/workspace/admin/users", icon: Users },
      { label: "Merchants", href: "/workspace/admin/merchants", icon: Store },
      {
        label: "Transactions",
        href: "/workspace/admin/transactions",
        icon: ArrowLeftRight,
      },
      { label: "Dispute Monitoring", href: "/workspace/admin", icon: Scale },
      { label: "AI monitoring", href: "/workspace/admin/ai", icon: Activity },
      {
        label: "Analytics & reports",
        href: "/workspace/admin/analytics",
        icon: ChartNoAxesCombined,
      },
      { label: "Audit logs", href: "/workspace/admin/audit", icon: BookOpen },
      {
        label: "Roles & permissions",
        href: "/workspace/admin/roles",
        icon: KeyRound,
      },
      { label: "Settings", href: "/workspace/admin/settings", icon: Settings2 },
    ];
  if (role === "SELLER")
    return [
      overview,
      {
        label: "Products & services",
        href: "/workspace/products",
        icon: Package,
      },
      { label: "Orders", href: "/workspace/orders", icon: BookOpen },
      { label: "Payments", href: "/workspace/payments", icon: ArrowLeftRight },
      {
        label: "Subscriptions",
        href: "/workspace/subscriptions",
        icon: Repeat2,
      },
      { label: "Disputes", href: "/workspace/cases", icon: Scale },
      {
        label: "Customer insights",
        href: "/workspace/insights",
        icon: ChartNoAxesCombined,
      },
      {
        label: "Seller Assistant",
        href: "/workspace/assistant",
        icon: Sailboat,
      },
      { label: "Notifications", href: "/workspace/notifications", icon: Bell },
      { label: "Settings", href: "/workspace/settings", icon: Settings2 },
    ];
  return [
    overview,
    { label: "Vela Assistant", href: "/workspace/assistant", icon: Sailboat },
    {
      label: "Transactions",
      href: "/workspace/transactions",
      icon: ArrowLeftRight,
    },
    { label: "Subscriptions", href: "/workspace/subscriptions", icon: Repeat2 },
    { label: "Digital library", href: "/workspace/library", icon: BookOpen },
    { label: "Disputes", href: "/workspace/cases", icon: Scale },
    { label: "Notifications", href: "/workspace/notifications", icon: Bell },
    { label: "Settings", href: "/workspace/settings", icon: Settings2 },
    { label: "Catalog", href: "/workspace/catalog", icon: ShoppingBag },
  ];
}
export function activeNavigation(items: NavigationItem[], pathname: string) {
  return [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) =>
        pathname === item.href ||
        (item.href !== "/workspace" && pathname.startsWith(item.href + "/")),
    )?.href;
}
