// Pure path rules for connection URLs, with no database import, so the
// proxy (proxy.ts) can use them on every request.

// Matches any well-formed connection path, whether or not it exists. The
// org and name are snake_case and the short id is lowercase alphanumeric.
// App routes all live under reserved words (`app`, `docs`, `oauth`, ...)
// that can never be an org, so a real connection can't shadow a page.
export const CONNECTION_PATH = /^\/([a-z0-9]+(?:_[a-z0-9]+)*)\/mcp\/([a-z0-9]+(?:_[a-z0-9]+)*)\/([a-z0-9]{1,16})\/?$/;

export function parseConnectionPath(path: string): { org: string; name: string; shortId: string } | null {
  const m = CONNECTION_PATH.exec(path);
  return m ? { org: m[1], name: m[2], shortId: m[3] } : null;
}


// Naming doc v2, section 8: one URL is both the MCP endpoint and a web
// page, told apart by method and Accept header.
//
//   POST                                  -> MCP
//   GET with Accept: text/event-stream    -> 405 (no GET stream: the
//                                            2026-07-28 spec removed it,
//                                            and we only answer JSON)
//   GET with Accept: text/html            -> the page
//   any other GET, including */*          -> 405, never HTML
//
// MCP clients never send a GET asking for HTML, so a browser and an agent
// can share the URL safely. HEAD follows GET. Every other method is 405.
export type ConnectionRoute = "mcp" | "page" | "method_not_allowed";

export function connectionRoute(method: string, accept: string | null): ConnectionRoute {
  const m = method.toUpperCase();
  if (m === "POST") return "mcp";
  if (m !== "GET" && m !== "HEAD") return "method_not_allowed";
  const types = (accept ?? "")
    .toLowerCase()
    .split(",")
    .map((t) => t.split(";")[0].trim());
  if (types.includes("text/event-stream")) return "method_not_allowed";
  if (types.includes("text/html")) return "page";
  return "method_not_allowed";
}

// Where the proxy rewrites a connection's POSTs. The folder name has a
// hyphen, which no org slug can, and the proxy refuses direct requests to
// it, so it is only reachable through a connection URL.
export const MCP_INTERNAL_PREFIX = "/mcp-internal";

export function internalMcpPath(p: { org: string; name: string; shortId: string }) {
  return `${MCP_INTERNAL_PREFIX}/${p.org}/${p.name}/${p.shortId}`;
}
