// Better Auth sends failed sign-ins back with ?error=<code>.
const ERRORS: Record<string, string> = {
  email_not_verified: "Verify your email with that provider first, then try again.",
  email_not_found: "That account didn't share an email address. Zeqqat needs one to sign you in.",
  account_not_linked: "That email already has a Zeqqat account. Sign in the way you did before.",
};

export function signInErrorText(code: string | undefined): string | null {
  if (!code) return null;
  return ERRORS[code] ?? "Sign-in didn't work. Try again.";
}
