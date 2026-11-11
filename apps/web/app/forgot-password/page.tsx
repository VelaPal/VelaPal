import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
export default function ForgotPasswordPage() {
  return <AuthLayout><div className="vp-auth-heading"><p className="vp-eyebrow">ACCOUNT RECOVERY</p><h1>Password recovery unavailable</h1><p>The connected Express API does not currently expose password recovery.</p><Link className="vp-button" href="/login">Back to sign in</Link></div></AuthLayout>;
}
