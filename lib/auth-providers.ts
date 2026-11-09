import { edition } from "./edition";
import { mailerConfigured } from "./mailer";

// Which sign-in methods this install offers. ENABLED_AUTH_PROVIDERS lists any
// of google, github, email and password. Unset, zeqqat.com uses Google and a
// self-hosted install uses password, which needs no outside setup: no OAuth
// app, no mail account.
// Empty counts as unset: a compose file passing ${ENABLED_AUTH_PROVIDERS}
// with nothing behind it must not leave an install with no way to sign in.
const raw = process.env.ENABLED_AUTH_PROVIDERS?.trim() || (edition() === "cloud" ? "google" : "password");
export const enabledProviders = raw
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter(Boolean);

// Email sign-in sends a one-time code, so it needs a mailer (lib/mailer.ts).
// Listed without one, it stays off.
export const emailEnabled = enabledProviders.includes("email") && mailerConfigured();

// Passwords are for self-hosted installs only. zeqqat.com never offers them,
// even if listed: there, every account proves its email through a provider.
export const passwordEnabled = edition() !== "cloud" && enabledProviders.includes("password");

export type SignInProvider = "google" | "github" | "email" | "password";

// Sign-in methods to render, in display order. Only providers that are both
// enabled and configured here.
export const signInProviders: SignInProvider[] = (["google", "github", "email", "password"] as const).filter((p) =>
  p === "email" ? emailEnabled : p === "password" ? passwordEnabled : enabledProviders.includes(p),
);
