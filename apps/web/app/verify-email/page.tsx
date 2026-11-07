"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Mail, CheckCircle2 } from "lucide-react";
import AuthLayout from "@/components/layout/auth-layout";
import {
  readRegistrationPreview,
  verifyRegistrationPreview,
  type RegistrationPreview,
} from "@/features/auth/registration-preview";
export default function VerifyPage() {
  const [preview, setPreview] = useState<RegistrationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void readRegistrationPreview().then((p) => {
      setPreview(p);
      setLoading(false);
    });
  }, []);
  return (
    <AuthLayout>
      <div className="vp-verify-icon">
        {preview?.verified ? <CheckCircle2 size={28} /> : <Mail size={28} />}
      </div>
      <div className="vp-auth-heading">
        <p className="vp-eyebrow">EMAIL VERIFICATION PREVIEW</p>
        <h1>
          {preview?.verified
            ? "Your next step is ready."
            : expired
              ? "This link has expired."
              : "Check your inbox."}
        </h1>
        <p>
          {preview?.verified
            ? "The account creation preview is complete."
            : "Verify ownership of your email before continuing."}
        </p>
      </div>
      {loading ? (
        <p role="status">Loading preview...</p>
      ) : !preview ? (
        <>
          <p>No pending account preview. Create an account to start.</p>
          <Link className="vp-button" href="/register">
            Create an account
          </Link>
        </>
      ) : (
        <div className="vp-auth-form">
          <p className="vp-verification-copy">
            {preview.verified
              ? `Email verification for ${preview.email} has been simulated. No real account has been created.`
              : `A production verification link would be sent to ${preview.email}. No email is sent in this prototype.`}
          </p>
          {!preview.verified && (
            <>
              <button
                className="vp-button"
                disabled={expired}
                onClick={() => setPreview(verifyRegistrationPreview(preview))}
              >
                Simulate verified email
              </button>
              <button
                className="vp-secondary"
                onClick={() => {
                  setExpired(false);
                  setNotice(
                    "A fresh verification link was simulated. No email was sent.",
                  );
                }}
              >
                Resend verification link
              </button>
              <button
                className="vp-link"
                onClick={() => {
                  setExpired(true);
                  setNotice("");
                }}
              >
                Test expired link
              </button>
            </>
          )}
          {preview.verified && (
            <Link className="vp-button" href="/login">
              Explore with a demo account
            </Link>
          )}
          {notice && <p role="status">{notice}</p>}
          <Link className="vp-link" href="/login">
            Back to sign in
          </Link>
        </div>
      )}
      <p className="vp-auth-disclosure">
        This is a local frontend preview. Continue with a seeded demo account to
        explore the workspace.
      </p>
    </AuthLayout>
  );
}
