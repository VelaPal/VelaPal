"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  ShieldCheck,
  X,
} from "lucide-react";
import { useSession } from "@/features/auth/session";
import { useAction } from "@/components/ui/workflow";
import Brand from "./brand";
import { WorkspacePicker } from "./workspace-controls";
import {
  activeNavigation,
  workspaceNavigation,
  type NavigationItem,
} from "./navigation";
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { session } = useSession();
  const pathname = usePathname();
  const items = workspaceNavigation(session?.activeWorkspace.type);
  const active = activeNavigation(items, pathname);
  return (
    <nav aria-label="Workspace" className="vp-main-navigation">
      <p className="vp-nav-label">
        {session?.activeWorkspace.type === "SELLER"
          ? "YOUR BUSINESS"
          : session?.activeWorkspace.type === "ADMIN"
            ? "OPERATIONS"
            : "WORKSPACE"}
      </p>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={active === item.href ? "page" : undefined}
        >
          <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
function Profile({ onNavigate }: { onNavigate?: () => void }) {
  const { session, logout } = useSession();
  const action = useAction();
  return (
    <div className="vp-sidebar-bottom">
      <div className="vp-sidebar-assurance">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          Always your decision.
          <small>
            {session?.activeWorkspace.type === "ADMIN"
              ? "Scoped. Reviewed. Recorded."
              : "Thoughtful help. Full control."}
          </small>
        </div>
      </div>
      <Link
        className="vp-sidebar-profile"
        href={
          session?.activeWorkspace.type === "ADMIN"
            ? "/workspace/admin/settings"
            : "/workspace/settings"
        }
        onClick={onNavigate}
        aria-label="Account and security"
      >
        <span className="vp-avatar">{session?.user.name.charAt(0)}</span>
        <div>
          <strong>{session?.user.name}</strong>
          <small>
            {session?.activeWorkspace.type === "CUSTOMER"
              ? "Personal account"
              : session?.activeWorkspace.name}
          </small>
        </div>
        <ChevronRight size={14} aria-hidden="true" />
      </Link>
      <button
        type="button"
        className="vp-sign-out"
        disabled={action.busy}
        onClick={() => void action.run(logout, "")}
      >
        <LogOut size={15} aria-hidden="true" />
        Sign out
      </button>
      {action.feedback}
    </div>
  );
}
export default function Sidebar() {
  const drawerRef = useRef<HTMLDialogElement>(null);
  const { session } = useSession();
  const pathname = usePathname();
  const items = workspaceNavigation(session?.activeWorkspace.type);
  const active = activeNavigation(items, pathname);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const close = () => {
      if (media.matches) drawerRef.current?.close();
    };
    media.addEventListener("change", close);
    return () => media.removeEventListener("change", close);
  }, []);
  const close = () => drawerRef.current?.close();
  let bottom: NavigationItem[];
  if (session?.activeWorkspace.type === "CUSTOMER")
    bottom = items.filter((i) =>
      ["Overview", "Vela Assistant", "Transactions", "Subscriptions"].includes(
        i.label,
      ),
    );
  else bottom = items.slice(0, 4);
  return (
    <>
      <aside className="vp-desktop-sidebar">
        <Brand />
        <WorkspacePicker />
        <Navigation />
        <Profile />
      </aside>
      <div className="vp-mobile-brand">
        <button
          type="button"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-controls="mobile-navigation"
          className="vp-icon-button"
          onClick={() => drawerRef.current?.showModal()}
        >
          <Menu size={19} aria-hidden="true" />
        </button>
        <Brand />
      </div>
      <dialog
        ref={drawerRef}
        id="mobile-navigation"
        aria-label="Workspace navigation"
        className="vp-mobile-drawer"
      >
        <div className="vp-drawer-heading">
          <Brand onNavigate={close} />
          <button
            type="button"
            className="vp-icon-button"
            aria-label="Close navigation"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <WorkspacePicker />
        <Navigation onNavigate={close} />
        <Profile onNavigate={close} />
      </dialog>
      <nav aria-label="Mobile workspace" className="vp-mobile-bottom-nav">
        {bottom.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active === item.href ? "page" : undefined}
          >
            <item.icon size={19} strokeWidth={1.6} aria-hidden="true" />
            <span>
              {item.label === "Overview"
                ? "Home"
                : item.label === "Vela Assistant"
                  ? "Vela"
                  : item.label === "Orders & payments"
                    ? "Orders"
                    : item.label}
            </span>
          </Link>
        ))}
        <button
          type="button"
          aria-label="More navigation"
          aria-haspopup="dialog"
          onClick={() => drawerRef.current?.showModal()}
        >
          <MoreHorizontal size={20} aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
