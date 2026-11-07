"use client";
import { useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  return (
    <AuthLayout>
      <div className="vp-auth-heading">
        <p className="vp-eyebrow">ACCOUNT RECOVERY</p>
        <h1>{sent ? "Check your inbox." : "A fresh start."}</h1>
        <p>
          {sent
            ? "Recovery request simulated. No email was sent."
            : "Enter your email to preview password recovery."}
        </p>
      </div>
      {!sent && (
        <form
          className="vp-auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              sessionStorage.setItem(
                "velapal:recovery-preview",
                JSON.stringify({
                  expiresAt: Date.now() + 15 * 60 * 1000,
                  used: false,
                }),
              );
              setSent(true);
            } catch {
              setSent(false);
            }
          }}
        >
          <label className="vp-label">
            Email address
            <input
              className="vp-input"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.test"
            />
          </label>
          <button className="vp-button">Preview recovery email</button>
        </form>
      )}
      {sent && (
        <Link className="vp-button" href="/reset-password">
          Preview reset link
        </Link>
      )}
      <p className="vp-auth-disclosure">
        Frontend preview only. This does not change an account password.
      </p>
      <Link className="vp-link" href="/login">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
