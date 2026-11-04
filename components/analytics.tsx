import { connection } from "next/server";

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
 */
export async function Analytics({ nonce }: { nonce?: string }) {
  await connection();

  const src = process.env.UMAMI_SCRIPT_URL?.trim();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId) return null;

  // A plain deferred tag, matching Umami's own install snippet. The nonce lets
  // it past the Content-Security-Policy set in proxy.ts.
  return <script defer src={src} data-website-id={websiteId} nonce={nonce} />;
}
