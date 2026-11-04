// Org slugs (naming doc v2, section 1): lowercase snake_case, globally
// unique, e.g. `acme_corp`, `gaita`. Snake_case rather than kebab-case
// because the slug is the first segment of every wire tool name
// (`acme_corp-dokploy-http-application_deploy-v1`), where `-` is reserved
// as the segment separator.
export const ORG_SLUG = /^[a-z0-9]+(_[a-z0-9]+)*$/;
export const ORG_SLUG_MIN = 2;
export const ORG_SLUG_MAX = 39;

// Words that can't become an org, because the org is the first path
// segment of zeqqat.com/<org>/... and these are routes (or may become
// routes). The first line is the naming doc's list; the rest are the app's
// own top-level routes and names that would read as official. `w` and `t`
// are no longer used in URLs but stay reserved in case they come back.
// (`.well-known` is reserved too, and can never pass ORG_SLUG anyway.)
export const RESERVED_USERNAMES = new Set([
  "api", "oauth", "mcp", "docs", "admin", "zeqqat", "login", "settings", "c", "w", "t",
  "app", "signin", "signup", "signout", "logout", "invite", "invites", "auth",
  "v1", "search", "new", "about", "help", "support", "official", "verified",
  "status", "blog", "pricing", "terms", "privacy", "security", "static", "assets",
  "public", "favicon", "robots", "sitemap", "well_known",
]);

export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, ORG_SLUG_MAX)
    .replace(/_+$/g, "");
}

export function isValidOrgSlug(slug: string): boolean {
  return slug.length >= ORG_SLUG_MIN && slug.length <= ORG_SLUG_MAX && ORG_SLUG.test(slug);
}

// Derives a candidate namespace from the profile name, falling back to the
// email local part, then to "user". Does not check uniqueness or
// reserved-name collisions — the caller does that inside the signup
// transaction, since it needs to hold the lock while checking.
export function deriveUsername(name: string, email: string): string {
  const fromName = normalizeSlug(name);
  if (fromName.length >= ORG_SLUG_MIN) return fromName;

  const localPart = email.split("@")[0] ?? "";
  const fromEmail = normalizeSlug(localPart);
  if (fromEmail.length >= ORG_SLUG_MIN) return fromEmail;

  return "user";
}

export function isReserved(username: string): boolean {
  return RESERVED_USERNAMES.has(username);
}
