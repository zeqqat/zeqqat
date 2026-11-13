// A self-hosted install can be reached over http (Dokploy's template
// creates its domain without a certificate, or HTTPS isn't turned on yet)
// while ZEQQAT_PUBLIC_URL says https, or the other way round. Sign-in has
// to work either way, so lib/auth.ts keeps a second sign-in setup for the
// same host with the other scheme, and each request uses the one matching
// how it arrived. Only the install's own host ever switches.

export type Scheme = "http" | "https";

// The scheme a request really arrived on, from the reverse proxy's
// X-Forwarded-Proto (Traefik sets it and overwrites what clients send).
// Null when there is no proxy in front, e.g. docker on localhost.
export function requestScheme(h: Headers): Scheme | null {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return proto === "http" || proto === "https" ? proto : null;
}

function requestHost(h: Headers): string | null {
  const raw = h.get("x-forwarded-host") ?? h.get("host");
  return raw?.split(",")[0]?.trim().toLowerCase() || null;
}

// The public URL with its scheme flipped (https ↔ http), or null when it
// isn't a usable http(s) URL.
export function flippedUrl(publicUrl: string | undefined): string | null {
  if (!publicUrl) return null;
  try {
    const u = new URL(publicUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.protocol = u.protocol === "https:" ? "http:" : "https:";
    return u.origin;
  } catch {
    return null;
  }
}

// True when this request came to the install's own host on the other
// scheme than ZEQQAT_PUBLIC_URL's, so the flipped sign-in setup applies.
export function usesFlippedScheme(publicUrl: string | undefined, h: Headers): boolean {
  if (!publicUrl) return false;
  const scheme = requestScheme(h);
  if (!scheme) return false;
  try {
    const u = new URL(publicUrl);
    if (requestHost(h) !== u.host.toLowerCase()) return false;
    return `${scheme}:` !== u.protocol;
  } catch {
    return false;
  }
}

// Served over plain http on a host that isn't this machine: the case the
// "Turn on HTTPS" banner is for (agents like Claude need https).
export function servedWithoutHttps(h: Headers): boolean {
  if (requestScheme(h) !== "http") return false;
  const host = requestHost(h)?.replace(/:\d+$/, "") ?? "";
  return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) && !host.endsWith(".localhost");
}
