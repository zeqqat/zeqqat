import { NextResponse, type NextRequest } from "next/server";
import { connectionRoute, internalMcpPath, MCP_INTERNAL_PREFIX, parseConnectionPath } from "./lib/connection-paths";

// A nonce-based policy rather than 'unsafe-inline': the consent screen
// renders a client name that the client itself chose at registration, so
// script injection there is the one XSS route an attacker actually
// controls. React escapes it, and this is the second lock on that door.
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets Next's own bootstrap script load the chunks it
    // needs without naming each one; CSP3 browsers ignore the host source
    // alongside it, and older ones fall back to 'self'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next injects inline <style> for its CSS; there's no nonce path for it.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    // next/font self-hosts at build time, so no font CDN is needed.
    "font-src 'self'",
    `connect-src 'self'${analyticsOrigin()}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

// The Umami tracker posts its events back to its own origin. Unset (every
// self-hosted install by default) means nothing extra is allowed.
function analyticsOrigin(): string {
  const src = process.env.UMAMI_SCRIPT_URL?.trim();
  if (!src) return "";
  try {
    return ` ${new URL(src).origin}`;
  } catch {
    return "";
  }
}

// The blog, sitemap and robots.txt belong to zeqqat.com. A self-hosted
// install serves no blog and asks crawlers to stay out, decided here at
// runtime because the same image runs both editions.
function selfHostedOnly(path: string): NextResponse | null {
  if (process.env.ZEQQAT_EDITION === "cloud") return null;
  if (path === "/robots.txt") {
    return new NextResponse("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain" } });
  }
  if (path === "/sitemap.xml" || path === "/blog" || path.startsWith("/blog/")) {
    return new NextResponse(null, { status: 404 });
  }
  return null;
}

function withCsp(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);

  // Next reads the nonce back off the request headers to stamp it onto the
  // scripts it generates itself, so the CSP has to go on both sides.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // The internal MCP handler is only reachable through a connection URL.
  if (path === MCP_INTERNAL_PREFIX || path.startsWith(`${MCP_INTERNAL_PREFIX}/`)) {
    return new NextResponse(null, { status: 404 });
  }

  const blocked = selfHostedOnly(path);
  if (blocked) return blocked;

  const conn = parseConnectionPath(path);
  if (!conn) return withCsp(request);

  // A connection URL is both the MCP endpoint and a page (naming doc v2,
  // section 8). Vary: Accept on every response, so a cache in front of us
  // (Cloudflare) never hands cached HTML to an MCP client.
  const route = connectionRoute(request.method, request.headers.get("accept"));
  if (route === "mcp") {
    const url = request.nextUrl.clone();
    url.pathname = internalMcpPath(conn);
    const response = NextResponse.rewrite(url);
    response.headers.set("vary", "Accept");
    return response;
  }
  if (route === "page") {
    // Next builds the Vary header of a rendered page itself and drops this
    // one. What keeps a cache from storing the HTML is that every page is
    // dynamic and served `Cache-Control: private, no-store`; the MCP and
    // 405 responses, the ones a cache could otherwise mix up, carry
    // Vary: Accept.
    const response = withCsp(request);
    response.headers.set("vary", "Accept");
    return response;
  }
  return new NextResponse(null, { status: 405, headers: { allow: "GET, POST", vary: "Accept" } });
}

export const config = {
  matcher: [
    // Connection URLs always go through the proxy, prefetch or not: the
    // method and Accept header decide whether they get MCP or a page.
    "/:org/mcp/:name/:id",
    "/mcp-internal/:path*",
    // Static assets are served straight from disk and carry no markup, so
    // there's nothing for a policy to protect there.
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
