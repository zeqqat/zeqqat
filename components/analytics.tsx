import { connection } from "next/server";
import { signupToReport } from "../lib/signup-report";
import { SignupBeacon } from "./SignupBeacon";

/**
 * The Umami tracker tag, or nothing at all.
 *
 * zeqqat.com runs its own Umami, so no visitor data leaves infrastructure
 * the project already runs. No cookies and no cross-site identifier, which is
 * why there is no consent banner.
 *
 * Both values are read at runtime and neither is a secret (both are visible
 * in the page source of any Umami site). `connection()` keeps them from being
 * baked into a build that never had them. Unset means no tag, so a local or
 * self-hosted install reports nothing.
 *
 * With the tag comes SignupBeacon: it sends one "signup" event, carrying
 * where the person first came from and the page they landed on, the first
 * time a new account loads any page. That is how Umami counts sign-ups by
 * source.
 */
export async function Analytics({ nonce }: { nonce?: string }) {
  await connection();

  const src = process.env.UMAMI_SCRIPT_URL?.trim();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId) return null;

  // A plain deferred tag, matching Umami's own install snippet. The nonce lets
  // it past the Content-Security-Policy set in proxy.ts.
  const report = await signupToReport();
  return (
    <>
      <script defer src={src} data-website-id={websiteId} nonce={nonce} />
      <SignupBeacon report={report} />
    </>
  );
}
