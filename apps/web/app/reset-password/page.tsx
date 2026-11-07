"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AuthLayout from "@/components/layout/auth-layout";
import PasswordField from "@/components/ui/password-field";
export default function ResetPassword() {
  const [available, setAvailable] = useState(false);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        const pending = JSON.parse(
          sessionStorage.getItem("velapal:recovery-preview") || "null",
        );
        setAvailable(!!pending && !pending.used);
        setExpired(!!pending && pending.expiresAt <= Date.now());
      } catch {
        setAvailable(false);
      }
    });
  }, []);
  return (
    <AuthLayout>
      <div className="vp-auth-heading">
        <p className="vp-eyebrow">ACCOUNT RECOVERY PREVIEW</p>
        <h1>
          {done
            ? "A fresh start, previewed."
            : expired
              ? "This link has expired."
              : "Choose a new password."}
        </h1>
        <p>
          {done
            ? "No real credential was changed. Sign in with an existing demo account."
            : "Reset links are short-lived and can only be used once."}
        </p>
      </div>
      {available && !expired && !done ? (
        <form
          className="vp-auth-form"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              const pending = JSON.parse(
                sessionStorage.getItem("velapal:recovery-preview") || "null",
              );
              if (!pending || pending.used || pending.expiresAt <= Date.now())
                throw new Error(
                  "This preview link is expired or already used.",
                );
              if (password.length < 15 || password.length > 128)
                throw new Error("Use 15–128 characters.");
              if (password !== confirm)
                throw new Error("Passwords do not match.");
              sessionStorage.setItem(
                "velapal:recovery-preview",
                JSON.stringify({ ...pending, used: true }),
              );
              setPassword("");
              setConfirm("");
              setDone(true);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Could not read the preview link.",
              );
            }
          }}
        >
          <PasswordField
            id="reset-password"
            label="New password"
            value={password}
            onChange={setPassword}
          />
          <PasswordField
            id="reset-confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
          />
          {error && (
            <p className="vp-field-error" role="alert">
              {error}
            </p>
          )}
          <button className="vp-button">Preview password reset</button>
          <button
            type="button"
            className="vp-link"
            onClick={() => {
              try {
                const saved = JSON.parse(
                  sessionStorage.getItem("velapal:recovery-preview") || "{}",
                );
                sessionStorage.setItem(
                  "velapal:recovery-preview",
                  JSON.stringify({ ...saved, expiresAt: 0 }),
                );
                setExpired(true);
              } catch {
                setError("Session storage is unavailable.");
              }
            }}
          >
            Test expired link
          </button>
        </form>
      ) : (
        !done && (
          <p className="vp-form-note">
            Request another recovery preview to continue.
          </p>
        )
      )}
      <p className="vp-auth-disclosure">
        Passwords are validated and discarded. No password, reset credential,
        email or new session is created. Real reset/revocation requires the
        backend recovery service.
      </p>
      <Link className="vp-link" href={done ? "/login" : "/forgot-password"}>
        {done ? "Back to sign in" : "Request another link"}
      </Link>
    </AuthLayout>
  );
}
