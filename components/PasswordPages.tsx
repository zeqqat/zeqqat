"use client";

import { useState } from "react";
import { authClient } from "../lib/auth-client";

function Spinner() {
  return <span className="zq-consent-spin" aria-hidden="true" />;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    const { error } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
    setPending(false);
    if (error) {
      setErr(error.status === 429 ? "Too many tries. Wait a minute, then try again." : "Couldn't send the link. Try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p className="zq-email-sent">If {email.trim()} has an account here, a reset link is on its way.</p>;
  }
  return (
    <form className="zq-email-form" onSubmit={submit}>
      <label className="zq-visually-hidden" htmlFor="zq-forgot-email">
        Email
      </label>
      <input
        id="zq-forgot-email"
        className="zq-input"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending}
      />
      {err && (
        <p className="zq-consent-error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="zq-google" disabled={pending || !email.trim()} aria-busy={pending}>
        Email me a link
        {pending && <Spinner />}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setErr(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      setErr(
        error.code === "PASSWORD_TOO_SHORT"
          ? "Use at least 10 characters."
          : error.code === "INVALID_TOKEN"
            ? "This link has expired or was already used. Ask for a new one."
            : "That didn't work. Try again.",
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <>
        <p className="zq-card-p">Your password is changed, and you&rsquo;re signed out everywhere else.</p>
        <p className="zq-alt">
          <a href="/signin">Sign in</a>
        </p>
      </>
    );
  }
  return (
    <form className="zq-email-form" onSubmit={submit}>
      <label className="zq-visually-hidden" htmlFor="zq-reset-password">
        New password
      </label>
      <input
        id="zq-reset-password"
        className="zq-input"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        placeholder="New password (10+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending}
        autoFocus
      />
      {err && (
        <p className="zq-consent-error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="zq-google" disabled={pending || password.length < 10} aria-busy={pending}>
        Save new password
        {pending && <Spinner />}
      </button>
    </form>
  );
}
