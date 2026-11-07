"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, UserRound, Store } from "lucide-react";
import AuthLayout from "@/components/layout/auth-layout";
import PasswordField from "@/components/ui/password-field";
import {
  registrationSchema,
  createRegistrationPreview,
  type RegistrationInput,
} from "@/features/auth/registration-preview";
export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegistrationInput>({
    party: "CUSTOMER",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    terms: false,
    businessName: "",
    businessCategory: "Digital content",
    country: "Indonesia",
    website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (key: keyof RegistrationInput, value: string | boolean) =>
    setForm((v) => ({ ...v, [key]: value }));
  const field = (
    key: "name" | "email" | "businessName" | "website",
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <label className="vp-label">
      {label}
      <input
        className="vp-input"
        type={type}
        value={form[key]}
        placeholder={placeholder}
        required={key !== "website"}
        autoComplete={
          key === "email" ? "email" : key === "name" ? "name" : undefined
        }
        onChange={(e) => update(key, e.target.value)}
        aria-invalid={!!errors[key]}
      />
      {errors[key] && <span className="vp-field-error">{errors[key]}</span>}
    </label>
  );
  return (
    <AuthLayout>
      <div className="vp-auth-heading">
        <p className="vp-eyebrow">VELAPAL ACCOUNT</p>
        <h1>Make room for better decisions.</h1>
        <p>Start with the workspace that fits you.</p>
      </div>
      <form
        className="vp-auth-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = registrationSchema.safeParse(form);
          if (!parsed.success) {
            setErrors(
              Object.fromEntries(
                parsed.error.issues.map((i) => [String(i.path[0]), i.message]),
              ),
            );
            return;
          }
          try {
            createRegistrationPreview(parsed.data);
            setForm((v) => ({ ...v, password: "", confirmPassword: "" }));
            router.push("/verify-email");
          } catch {
            setErrors({
              storage: "Allow session storage to continue this local preview.",
            });
          }
        }}
      >
        <div
          className="vp-account-choices"
          role="group"
          aria-label="Account type"
        >
          {(["CUSTOMER", "SELLER"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="vp-account-choice"
              aria-pressed={form.party === p}
              onClick={() => {
                update("party", p);
                setErrors({});
              }}
            >
              {p === "CUSTOMER" ? <UserRound size={20} /> : <Store size={20} />}
              <span>
                <strong>
                  {p === "CUSTOMER" ? "Personal account" : "Seller account"}
                </strong>
                <small>
                  {p === "CUSTOMER"
                    ? "Buy, track, and resolve"
                    : "Sell and manage your business"}
                </small>
              </span>
            </button>
          ))}
        </div>
        {field(
          "name",
          form.party === "SELLER" ? "Owner / responsible person" : "Full name",
          "Alex Morgan",
        )}
        {form.party === "SELLER" && (
          <>
            {field("businessName", "Business name", "Your business")}
            <div className="vp-field-pair">
              <label className="vp-label">
                Business category
                <select
                  className="vp-input"
                  value={form.businessCategory}
                  onChange={(e) => update("businessCategory", e.target.value)}
                >
                  {["Digital content", "Physical goods", "Services"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
              <label className="vp-label">
                Country
                <select
                  className="vp-input"
                  value={form.country}
                  onChange={(e) => update("country", e.target.value)}
                >
                  {["Indonesia", "Singapore", "United States"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            {field(
              "website",
              "Business website (optional)",
              "https://example.test",
              "url",
            )}
          </>
        )}
        {field(
          "email",
          form.party === "SELLER" ? "Business email" : "Email address",
          "alex@example.test",
          "email",
        )}
        <PasswordField
          id="register-password"
          label="Password"
          value={form.password}
          onChange={(v) => update("password", v)}
          error={errors.password}
        />
        <p className="vp-form-note">
          Use 15–128 characters. Demo passwords are validated, then discarded.
        </p>
        <PasswordField
          id="register-confirm"
          label="Confirm password"
          value={form.confirmPassword}
          onChange={(v) => update("confirmPassword", v)}
          error={errors.confirmPassword}
        />
        <label className="vp-consent-label">
          <input
            type="checkbox"
            checked={form.terms}
            onChange={(e) => update("terms", e.target.checked)}
          />
          <span>
            I agree to the demo <Link href="/terms">Terms</Link> and{" "}
            <Link href="/privacy">Privacy</Link> notice.
          </span>
        </label>
        {errors.terms && (
          <p role="alert" className="vp-field-error">
            {errors.terms}
          </p>
        )}
        {errors.storage && <p role="alert">{errors.storage}</p>}
        <button className="vp-button w-full">
          Create {form.party === "SELLER" ? "seller" : "personal"} account
          <ArrowRight size={16} />
        </button>
      </form>
      <p className="vp-auth-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
      <p className="vp-form-note">
        Administrator accounts are invite-only. Business approval does not
        connect PayPal.
      </p>
      <p className="vp-auth-disclosure">
        Prototype only. Use fictional information. Authentication, email and MFA
        are simulated; no real payment or credential is created.
      </p>
    </AuthLayout>
  );
}
