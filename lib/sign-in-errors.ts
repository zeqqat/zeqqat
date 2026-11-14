// Better Auth sends failed sign-ins back with ?error=<code>.
const ERRORS: Record<string, string> = {
  email_not_verified: "Verify your email with that provider first, then try again.",
  email_not_found: "That account didn't share an email address. Zeqqat needs one to sign you in.",
  account_not_linked: "That email already has a Zeqqat account. Sign in the way you did before.",
  // The 5-minute state cookie was gone when the provider sent the person
  // back: they took longer than that, or came back in another window.
  state_mismatch: "That sign-in took too long, or finished in a different window. Try again.",
  state_not_found: "That sign-in took too long, or finished in a different window. Try again.",
};

export function signInErrorText(code: string | undefined): string | null {
  if (!code) return null;
  return ERRORS[code] ?? "Sign-in didn't work. Try again.";
}
