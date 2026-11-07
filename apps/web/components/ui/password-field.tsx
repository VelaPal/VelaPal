"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export default function PasswordField({
  label,
  id,
  value,
  onChange,
  error,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="vp-label">
        {label}
      </label>
      <div className="vp-password-field">
        <input
          id={id}
          className="vp-input"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={15}
          maxLength={128}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          aria-label={`${show ? "Hide" : "Show"} ${label.toLowerCase()}`}
          onClick={() => setShow((v) => !v)}
        >
          {show ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="vp-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
