import { isReserved, ORG_SLUG } from "./username";

// Dashboard URLs, like Twitter and GitHub: the account is the first path
// segment, the workspace the second.
//
//   /<username>                      the account's page (public profile when
//                                    you aren't in it, its workspaces when
//                                    you are)
//   /<username>/members|settings|... the account's own pages
//   /<username>/<workspace>/...      one workspace's pages
//   /<username>/<a.b.c>              a tool or policy page (always dotted)
//   /<username>/mcp/<name>/<id>      an MCP URL (never has a workspace in it,
//                                    because an MCP URL can move between
//                                    workspaces)
//
// /app is kept as "take me to my dashboard": it redirects to the workspace
// you were last in (app/[org]/[ws]/[[...rest]]/route.ts).

// The account level's own pages. A workspace can't take these names.
export const ACCOUNT_PAGES = new Set(["members", "settings", "dokploy-integrations", "workspaces"]);

// Workspace slugs that would collide with an account page or another route
// under /<username>/.
export const RESERVED_WORKSPACE_SLUGS = new Set([
  ...ACCOUNT_PAGES,
  "mcp", "c", "w", "t", "new", "api", "account", "releases", "feedback", "integrations", "apps", "policies", "tools",
]);

export function isReservedWorkspaceSlug(slug: string): boolean {
  return RESERVED_WORKSPACE_SLUGS.has(slug);
}

export function wsBase(orgSlug: string, wsSlug: string): string {
  return `/${orgSlug}/${wsSlug}`;
}

export function accountBase(orgSlug: string): string {
  return `/${orgSlug}`;
}

// The signed-in user's own profile. Not under an account: it's about the
// person, whichever account they're looking at.
export const PROFILE_PATH = "/account";

export type Place = { kind: "workspace"; org: string; ws: string } | { kind: "account"; org: string } | null;

// Which account (and workspace) a path is about, from the path alone. The
// proxy passes this on to the page; it only picks among workspaces the
// person can already open, it never grants access.
export function placeOf(pathname: string): Place {
  const seg = pathname.split("/").filter(Boolean);
  if (seg.length === 0) return null;
  const org = seg[0];
  if (!ORG_SLUG.test(org) || isReserved(org)) return null;
  if (seg.length === 1) return { kind: "account", org };
  const second = decodeURIComponent(seg[1]);
  if (ACCOUNT_PAGES.has(second)) return { kind: "account", org };
  // Tool and policy pages (dotted names) and MCP URLs belong to the
  // account, not a workspace, and don't need one picked.
  if (second.includes(".") || second.includes("@") || second === "mcp" || second === "c") return null;
  return { kind: "workspace", org, ws: second };
}
