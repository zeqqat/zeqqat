import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { accountBase, wsBase } from "./paths";
import { getServerSession } from "./session";
import { renamedTo } from "./username-alias";
import { getUserWorkspace, PATH_HEADER, placeFromRequest, type UserWorkspace } from "./workspace";

// Every page and server action starts with one of these. Owner-only
// actions re-check the role on the server: hiding a button is a
// convenience, this is the actual rule.

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user) {
    // Back to the page asked for once signed in.
    let next = "";
    try {
      const path = (await headers()).get(PATH_HEADER);
      if (path && path.startsWith("/") && !path.startsWith("//")) next = `?next=${encodeURIComponent(path)}`;
    } catch {
      next = "";
    }
    redirect(`/signin${next}`);
  }
  return session.user;
}

export async function requireWorkspace(): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; ws: UserWorkspace }> {
  const user = await requireUser();
  const ws = await getUserWorkspace(user.id);
  if (!ws) {
    // The URL names an account or workspace this person can't open: a 404,
    // like a private repo on GitHub, so nobody learns it exists. An old
    // username first follows its rename.
    const place = await placeFromRequest();
    if (place.org) {
      const renamed = await renamedTo(place.org);
      const path = (await headers()).get(PATH_HEADER);
      if (renamed && path) redirect(`/${renamed.slug}${path.slice(place.org.length + 1)}`);
      notFound();
    }
    // The signup transaction guarantees every user has a workspace; a missing
    // one here means that invariant broke, not a normal empty state.
    redirect("/signin");
  }
  return { user, ws };
}

// Where a workspace's (or an account's) pages live.
export function hrefIn(ws: Pick<UserWorkspace, "organizationSlug" | "workspaceSlug">, path = ""): string {
  return wsBase(ws.organizationSlug, ws.workspaceSlug) + path;
}

export function accountHref(ws: Pick<UserWorkspace, "organizationSlug">, path = ""): string {
  return accountBase(ws.organizationSlug) + path;
}

// The current workspace's address plus `path`, for redirects and links in
// server code that doesn't have the workspace at hand.
export async function here(path = ""): Promise<string> {
  const { ws } = await requireWorkspace();
  return hrefIn(ws, path);
}

export async function hereAccount(path = ""): Promise<string> {
  const { ws } = await requireWorkspace();
  return accountHref(ws, path);
}

// Workspace admin (org owners are admins of every workspace). Named for
// history: "owner" here means "may manage this workspace".
export async function requireOwner() {
  const ctx = await requireWorkspace();
  if (ctx.ws.wsRole !== "admin") redirect(hrefIn(ctx.ws, "?error=owner_only"));
  return ctx;
}

export const requireAdmin = requireOwner;

// Org-level changes: creating workspaces, changing who owns the org.
export async function requireOrgOwner() {
  const ctx = await requireWorkspace();
  if (ctx.ws.orgRole !== "owner") redirect(hrefIn(ctx.ws, "?error=owner_only"));
  return ctx;
}
