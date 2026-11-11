import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
export default function VerifyEmailPage() {
  return <AuthLayout><div className="vp-auth-heading"><p className="vp-eyebrow">VELAPAL ACCOUNT</p><h1>Email verification unavailable</h1><p>Email verification is not exposed by the connected Express API.</p><Link className="vp-button" href="/login">Sign in</Link></div></AuthLayout>;
}
