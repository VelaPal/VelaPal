"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { authService } from "@/services/contracts/auth.service";
import { useSession } from "@/features/auth/session";
import { useAction } from "@/components/ui/workflow";
import AuthLayout from "@/components/layout/auth-layout";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { accept, loading } = useSession();
  const router = useRouter();
  const action = useAction();
  return (
    <AuthLayout>
      <div className="vp-auth-heading">
        <p className="vp-eyebrow">VELAPAL ACCOUNT</p>
        <h1>{challenge ? "Admin verification" : "Welcome back"}</h1>
        <p>
          {challenge
            ? "Administrator access requires an additional verification."
            : "A little less admin. A little more clarity."}
        </p>
      </div>
      <form
        className="vp-auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            if (challenge) {
              const s = await authService.verifyMfa(challenge, code);
              if (s.status !== "AUTHENTICATED")
                throw new Error("Login session required");
              accept(s);
              router.replace("/workspace");
            } else {
              z.email().parse(email);
              z.string().min(8).parse(password);
              const s = await authService.login(email, password);
              if (s.status === "MFA_REQUIRED") setChallenge(s.challengeId);
              else {
                accept(s);
                router.replace("/workspace");
              }
            }
          }, "");
        }}
      >
        <fieldset className="vp-auth-fields" disabled={loading || action.busy}>
          {challenge ? (
            <label className="vp-label">
              Authentication code
              <input
                className="vp-input"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label className="vp-label">
                Email address
                <input
                  className="vp-input"
                  type="email"
                  aria-label="Email"
                  placeholder="you@example.com"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="vp-label">
                Password
                <span className="vp-password-field">
                  <input
                    className="vp-input"
                    type={showPassword ? "text" : "password"}
                    aria-label="Password"
                    autoComplete="current-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
            </>
          )}
          <button className="vp-button w-full" disabled={action.busy}>
            {action.busy
              ? "Checking…"
              : challenge
                ? "Verify and sign in"
                : "Sign in"}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </fieldset>
      </form>
      {action.feedback}
      {challenge && (
        <button className="vp-link" onClick={() => setChallenge("")}>
          Back to sign in
        </button>
      )}
      {!challenge && (
        <>
          <p className="vp-auth-switch">
            <Link href="/forgot-password">Forgot password?</Link>
          </p>
          <p className="vp-auth-switch">
            New to VelaPal? <Link href="/register">Create an account</Link>
          </p>
        </>
      )}
      <p className="vp-auth-disclosure">
        <ShieldCheck size={13} />
        Your account is authenticated by VelaPal’s API.
      </p>
    </AuthLayout>
  );
}
