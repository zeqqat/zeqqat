"use client";

import { useState, type InputHTMLAttributes } from "react";

// A password field with an eye to show what you typed and hide it again.
// Hidden by default. The claim form asks for the password once (no
// "confirm"), so seeing it is the guard against a typo locking someone out.
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <span className="zq-pw">
      <input {...props} type={shown ? "text" : "password"} />
      <button
        type="button"
        className="zq-pw-eye"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
        disabled={props.disabled}
      >
        {shown ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.1M6.2 6.2C3.9 7.8 2.5 12 2.5 12s3.5 7 9.5 7c1.8 0 3.3-.5 4.6-1.2" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </span>
  );
}
