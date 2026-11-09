"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { authClient } from "../lib/auth-client";

// Client pieces of the sign-in page and the agent consent screen
// (/oauth/authorize): sign-in buttons with an inline spinner (all one style,
// no provider is the "main" one), Allow/Cancel with a pending state, and
// "Switch account".

export type SignInProvider = "google" | "github" | "email" | "password";
export type PasswordMode = "setup" | "signin" | "invite";

type Social = Exclude<SignInProvider, "email" | "password">;

const LABELS: Record<Social, string> = {
  google: "Continue with Google",
  github: "Continue with GitHub",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.6z" />
      <path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3C3.7 21.4 7.6 24 12 24z" />
      <path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6l3.8-3z" />
      <path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3C17.7 1.2 15.1 0 12 0 7.6 0 3.7 2.6 1.8 6.1l3.8 3C6.5 6.7 9 4.8 12 4.8z" />
    </svg>
  );
}

function GitHubIcon() {
  return <span className="zq-consent-gh" aria-hidden="true" />;
}

function Spinner() {
  return <span className="zq-consent-spin" aria-hidden="true" />;
}

export function SignInButtons({
  providers,
  callbackURL,
  errorCallbackURL = callbackURL,
  error,
  passwordMode = "signin",
  inviteEmail,
  inviteToken,
}: {
  providers: SignInProvider[];
  callbackURL: string;
  errorCallbackURL?: string;
  error?: string | null;
  passwordMode?: PasswordMode;
  inviteEmail?: string;
  inviteToken?: string;
}) {
  const [busy, setBusy] = useState<SignInProvider | null>(null);
  const social = providers.filter((p): p is Social => p !== "email" && p !== "password");
  const withEmail = providers.includes("email");
  const withPassword = providers.includes("password");

  async function start(provider: Social) {
    setBusy(provider);
    try {
      await authClient.signIn.social({ provider, callbackURL, errorCallbackURL });
    } catch {
      setBusy(null);
    }
  }

  return (
    <div className="zq-consent-methods">
      {error && (
        <p className="zq-consent-error" role="alert">
          {error}
        </p>
      )}
      {social.map((p) => (
        <button
          key={p}
          type="button"
          className="zq-google zq-consent-alt"
          disabled={busy !== null}
          aria-busy={busy === p}
          onClick={() => start(p)}
        >
          {p === "google" ? <GoogleIcon /> : <GitHubIcon />}
          {LABELS[p]}
          {busy === p && <Spinner />}
        </button>
      ))}
      {withEmail && (
        <>
          {social.length > 0 && (
            <div className="zq-or" role="separator">
              <span>or</span>
            </div>
          )}
          <EmailCode callbackURL={callbackURL} locked={busy !== null && busy !== "email"} onBusy={(b) => setBusy(b ? "email" : null)} />
        </>
      )}
      {withPassword && (
        <>
          {(social.length > 0 || withEmail) && (
            <div className="zq-or" role="separator">
              <span>or</span>
            </div>
          )}
          <PasswordForm
            mode={passwordMode}
            callbackURL={callbackURL}
            inviteEmail={inviteEmail}
            inviteToken={inviteToken}
            locked={busy !== null && busy !== "password"}
            onBusy={(b) => setBusy(b ? "password" : null)}
          />
        </>
      )}
    </div>
  );
}

const CODE_ERRORS: Record<string, string> = {
  INVALID_OTP: "That code isn't right. Check the email and try again.",
  OTP_EXPIRED: "That code has expired. Send a new one.",
  TOO_MANY_ATTEMPTS: "Too many wrong codes. Send a new one.",
  email_not_verified: "Sign-in didn't work. Try again.",
};

function codeError(e: { code?: string; status?: number; message?: string } | null | undefined): string {
  if (!e) return "Sign-in didn't work. Try again.";
  if (e.status === 429) return "Too many tries. Wait a minute, then try again.";
  return (e.code && CODE_ERRORS[e.code]) || "Sign-in didn't work. Try again.";
}

// Email sign-in: type your email, get a 6-digit code, type the code. A new
// email creates the account, an existing one signs in.
function EmailCode({ callbackURL, locked, onBusy }: { callbackURL: string; locked: boolean; onBusy: (b: boolean) => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setPending(true);
    onBusy(true);
    setErr(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
    setPending(false);
    onBusy(false);
    if (error) {
      setErr(error.status === 429 ? "Too many codes asked for. Wait a minute, then try again." : "Couldn't send the code. Check the address and try again.");
      return;
    }
    setStep("code");
    setCode("");
    setSentNote(`We sent a code to ${email.trim()}.`);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    onBusy(true);
    setErr(null);
    const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: code.trim() });
    if (error) {
      setPending(false);
      onBusy(false);
      setErr(codeError(error));
      return;
    }
    window.location.assign(callbackURL);
  }

  if (step === "email") {
    return (
      <form className="zq-email-form" onSubmit={send}>
        <label className="zq-visually-hidden" htmlFor="zq-signin-email">
          Email
        </label>
        <input
          id="zq-signin-email"
          className="zq-input"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending || locked}
        />
        {err && (
          <p className="zq-consent-error" role="alert">
            {err}
          </p>
        )}
        <button type="submit" className="zq-google zq-consent-alt" disabled={pending || locked || !email.trim()} aria-busy={pending}>
          <MailIcon />
          Email me a code
          {pending && <Spinner />}
        </button>
      </form>
    );
  }

  return (
    <form className="zq-email-form" onSubmit={verify}>
      <p className="zq-email-sent">{sentNote}</p>
      <label className="zq-visually-hidden" htmlFor="zq-signin-code">
        Code
      </label>
      <input
        id="zq-signin-code"
        className="zq-input zq-code-input"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        autoFocus
        placeholder="000000"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={pending}
      />
      {err && (
        <p className="zq-consent-error" role="alert">
          {err}
        </p>
      )}
      <button type="submit" className="zq-google" disabled={pending || code.length !== 6} aria-busy={pending}>
        Sign in
        {pending && <Spinner />}
      </button>
      <div className="zq-email-links">
        <button type="button" className="zq-link" onClick={() => send()} disabled={pending}>
          Send a new code
        </button>
        <button
          type="button"
          className="zq-link"
          onClick={() => {
            setStep("email");
            setErr(null);
          }}
          disabled={pending}
        >
          Use another email
        </button>
      </div>
    </form>
  );
}

const PASSWORD_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match.",
  USER_ALREADY_EXISTS: "That email already has an account. Sign in instead.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "That email already has an account. Sign in instead.",
  PASSWORD_TOO_SHORT: "Use at least 10 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
  signups_closed: "Sign-ups are closed. Ask an owner of this Zeqqat for an invite.",
};

function passwordError(e: { code?: string; status?: number } | null | undefined): string {
  if (e?.status === 429) return "Too many tries. Wait a minute, then try again.";
  return (e?.code && PASSWORD_ERRORS[e.code]) || "That didn't work. Try again.";
}

// Email and password, for self-hosted installs. "setup" creates the first
// account (the install's owner), "invite" creates an account for the
// invited email or signs into an existing one, "signin" only signs in:
// everyone after the first person joins by invite.
function PasswordForm({
  mode,
  callbackURL,
  inviteEmail,
  inviteToken,
  locked,
  onBusy,
}: {
  mode: PasswordMode;
  callbackURL: string;
  inviteEmail?: string;
  inviteToken?: string;
  locked: boolean;
  onBusy: (b: boolean) => void;
}) {
  const [creating, setCreating] = useState(mode !== "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const emailFixed = mode === "invite" && !!inviteEmail;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    onBusy(true);
    setErr(null);
    const { error } = creating
      ? await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
          fetchOptions: inviteToken ? { headers: { "x-zeqqat-invite": inviteToken } } : undefined,
        })
      : await authClient.signIn.email({ email: email.trim(), password });
    if (error) {
      setPending(false);
      onBusy(false);
      setErr(passwordError(error));
      return;
    }
    window.location.assign(callbackURL);
  }

  return (
    <form className="zq-email-form" onSubmit={submit}>
      {creating && (
        <>
          <label className="zq-visually-hidden" htmlFor="zq-pw-name">
            Your name
          </label>
          <input
            id="zq-pw-name"
            className="zq-input"
            required
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pending || locked}
          />
        </>
      )}
      <label className="zq-visually-hidden" htmlFor="zq-pw-email">
        Email
      </label>
      <input
        id="zq-pw-email"
        className="zq-input"
        type="email"
        required
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        readOnly={emailFixed}
        onChange={(e) => setEmail(e.target.value)}
        disabled={pending || locked}
      />
      <label className="zq-visually-hidden" htmlFor="zq-pw-password">
        Password
      </label>
      <input
        id="zq-pw-password"
        className="zq-input"
        type="password"
        required
        minLength={creating ? 10 : undefined}
        autoComplete={creating ? "new-password" : "current-password"}
        placeholder={creating ? "Password (10+ characters)" : "Password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={pending || locked}
      />
      {err && (
        <p className="zq-consent-error" role="alert">
          {err}
        </p>
      )}
      <button
        type="submit"
        className="zq-google"
        disabled={pending || locked || !email.trim() || !password || (creating && !name.trim())}
        aria-busy={pending}
      >
        {creating ? (mode === "setup" ? "Create owner account" : "Create account") : "Sign in"}
        {pending && <Spinner />}
      </button>
      <div className="zq-email-links">
        {mode === "invite" && (
          <button type="button" className="zq-link" onClick={() => (setCreating(!creating), setErr(null))} disabled={pending}>
            {creating ? "I already have an account" : "Create an account instead"}
          </button>
        )}
        {!creating && (
          <a className="zq-link zq-link-end" href="/forgot-password">
            Lost your password?
          </a>
        )}
      </div>
    </form>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6.5 8.5-6.5" />
    </svg>
  );
}

export function ConsentButtons({ denyAction }: { denyAction: (formData: FormData) => void | Promise<void> }) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState<"allow" | "cancel" | null>(null);

  return (
    <div className="zq-row-btns">
      <button
        type="submit"
        formAction={denyAction}
        className="zq-action"
        style={{ flex: "1 1 120px" }}
        disabled={pending}
        onClick={() => setClicked("cancel")}
      >
        Cancel
        {pending && clicked === "cancel" && <Spinner />}
      </button>
      <button
        type="submit"
        className="zq-action zq-action-primary"
        style={{ flex: "2 1 200px" }}
        disabled={pending}
        aria-busy={pending && clicked === "allow"}
        onClick={() => setClicked("allow")}
      >
        Allow
        {pending && clicked === "allow" && <Spinner />}
      </button>
    </div>
  );
}

export function SwitchAccount() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await authClient.signOut();
        } finally {
          window.location.reload();
        }
      }}
    >
      Switch account
    </button>
  );
}
