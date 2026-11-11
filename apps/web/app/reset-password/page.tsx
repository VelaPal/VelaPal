import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
export default function ResetPasswordPage() {
  return <AuthLayout><div className="vp-auth-heading"><p className="vp-eyebrow">ACCOUNT RECOVERY</p><h1>Password reset unavailable</h1><p>Password reset is not exposed by the connected Express API.</p><Link className="vp-button" href="/login">Back to sign in</Link></div></AuthLayout>;
}
