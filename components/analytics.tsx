import { connection } from "next/server";

/**
 * The Umami tracker tag, or nothing at all.
 *
 * Umami is self-hosted at analytics.zeqqat.com, so no visitor data leaves
 * infrastructure this project already runs. No cookies and no cross-site
 * identifier, which is why there is no consent banner.
 *
 * Both values are read at runtime from the Dokploy service environment and
 * neither is a secret (both are visible in the page source of any Umami site).
 * `connection()` keeps them from being baked into a build that never had them.
 * Unset means no tag, so a local or self-hosted build reports nothing.
 *
 * Same component as zeqqat-lab's `src/components/analytics.tsx`.
 */
export async function Analytics() {
  await connection();

  const src = process.env.UMAMI_SCRIPT_URL?.trim();
  const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
  if (!src || !websiteId) return null;

  // A plain deferred tag, matching Umami's own install snippet. `defer` runs it
  // at DOMContentLoaded, so a quick bounce is still counted. The tracker hooks
  // history.pushState itself, so client-side navigations are counted too.
  return <script defer src={src} data-website-id={websiteId} />;
}
