"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { authClient } from "../lib/auth-client";

// Client pieces of the sign-in page and the agent consent screen
// (/oauth/authorize): sign-in buttons with an inline spinner (all one style,
// no provider is the "main" one), Allow/Cancel with a pending state, and
// "Switch account".

export type SignInProvider = "google" | "github";

const LABELS: Record<SignInProvider, string> = {
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
}: {
  providers: SignInProvider[];
  callbackURL: string;
  errorCallbackURL?: string;
  error?: string | null;
}) {
  const [busy, setBusy] = useState<SignInProvider | null>(null);

  async function start(provider: SignInProvider) {
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
      {providers.map((p) => (
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
    </div>
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
