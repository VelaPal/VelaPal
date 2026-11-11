import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
export default function RegisterPage() {
  return <AuthLayout><div className="vp-auth-heading"><p className="vp-eyebrow">VELAPAL ACCOUNT</p><h1>Account registration unavailable</h1><p>The connected Express API does not currently provide account registration.</p><Link className="vp-button" href="/login">Sign in</Link></div></AuthLayout>;
}
