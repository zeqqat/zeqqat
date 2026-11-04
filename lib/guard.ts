import { redirect } from "next/navigation";
import { getServerSession } from "./session";
import { getUserWorkspace, type UserWorkspace } from "./workspace";

// Every page and server action starts with one of these. Owner-only
// actions re-check the role on the server: hiding a button is a
// convenience, this is the actual rule.

export async function requireUser() {
  const session = await getServerSession();
  if (!session?.user) redirect("/signin");
  return session.user;
}

export async function requireWorkspace(): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; ws: UserWorkspace }> {
  const user = await requireUser();
  const ws = await getUserWorkspace(user.id);
  // The signup transaction guarantees every user has a workspace; a missing
  // one here means that invariant broke, not a normal empty state.
  if (!ws) redirect("/signin");
  return { user, ws };
}

// Workspace admin (org owners are admins of every workspace). Named for
// history: "owner" here means "may manage this workspace".
export async function requireOwner() {
  const ctx = await requireWorkspace();
  if (ctx.ws.wsRole !== "admin") redirect("/app?error=owner_only");
  return ctx;
}

export const requireAdmin = requireOwner;

// Org-level changes: creating workspaces, changing who owns the org.
export async function requireOrgOwner() {
  const ctx = await requireWorkspace();
  if (ctx.ws.orgRole !== "owner") redirect("/app?error=owner_only");
  return ctx;
}
