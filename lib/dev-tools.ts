import { siteHost } from "./edition";

// Dev tools: "Start over as a new user" for testing the first-run flow
// through the real sign-in screens (Google, GitHub, email) without
// deleting anything. Only where ZEQQAT_DEV_TOOLS=1, and never on zeqqat.com
// whatever the env says.
//
// Starting over *retires* the signed-in user instead of deleting it: its
// email and its sign-in links are rewritten so nothing matches them any
// more, so the next sign-in with the same Google account (or email) makes
// a brand new user. The old user and all its data stay. The original email
// and link ids are kept inside the rewritten values, so a retired user can
// be switched back to later.

export function devToolsEnabled(): boolean {
  return process.env.ZEQQAT_DEV_TOOLS === "1" && siteHost() !== "zeqqat.com";
}

const RETIRED_DOMAIN = "retired.invalid";
const ACCOUNT_PREFIX = "retired:";

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}

export function retiredEmail(original: string, at: number): string {
  return `retired.${at}.${b64url(original.trim().toLowerCase())}@${RETIRED_DOMAIN}`;
}

// The email a retired user had, or null when the email isn't a retired one.
export function originalEmail(email: string): string | null {
  const m = /^retired\.(\d+)\.([A-Za-z0-9_-]+)@retired\.invalid$/.exec(email);
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64url").toString("utf8");
  } catch {
    return null;
  }
}

export function retiredAt(email: string): number | null {
  const m = /^retired\.(\d+)\./.exec(email);
  return m ? Number(m[1]) : null;
}

export function retiredAccountId(original: string, at: number): string {
  return `${ACCOUNT_PREFIX}${at}:${original}`;
}

// The provider's own id for a retired sign-in link, or null.
export function originalAccountId(accountId: string): string | null {
  if (!accountId.startsWith(ACCOUNT_PREFIX)) return null;
  const rest = accountId.slice(ACCOUNT_PREFIX.length);
  const i = rest.indexOf(":");
  if (i <= 0 || !/^\d+$/.test(rest.slice(0, i))) return null;
  return rest.slice(i + 1);
}

// Is this retired user the same person as the one signed in? Same original
// email, or a sign-in link from the same provider account.
export function sameIdentity(
  current: { email: string; links: { providerId: string; accountId: string }[] },
  retired: { email: string; links: { providerId: string; accountId: string }[] },
): boolean {
  const email = originalEmail(retired.email);
  if (email && email === current.email.trim().toLowerCase()) return true;
  const mine = new Set(current.links.map((l) => `${l.providerId}|${l.accountId}`));
  return retired.links.some((l) => {
    const orig = originalAccountId(l.accountId);
    return orig !== null && mine.has(`${l.providerId}|${orig}`);
  });
}
