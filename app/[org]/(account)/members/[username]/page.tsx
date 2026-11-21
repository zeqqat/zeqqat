import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CrumbLast } from "../../../../../components/AppShell";
import { AccountPersonPage, ErrorNote } from "../../../../../components/Members";
import { db } from "../../../../../db";
import { workspace } from "../../../../../db/schema";
import { accountHref, requireWorkspace } from "../../../../../lib/guard";
import { findAccountPerson, invitedBy } from "../../../../../lib/members";
import { listUserWorkspaces } from "../../../../../lib/workspace";

// One person in the account (/<username>/members/<their username>): the
// workspaces they're in with their role in each, and Manage (who added
// them, Owner, remove from the account).
export default async function AccountPersonRoute({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { user, ws } = await requireWorkspace();
  const { username } = await params;
  const { tab: rawTab, error } = await searchParams;
  const { person } = await findAccountPerson(ws.organizationId, user.id, decodeURIComponent(username));
  if (!person) notFound();
  const [mine, allWs, added] = await Promise.all([
    listUserWorkspaces(user.id),
    db
      .select({ id: workspace.id, slug: workspace.slug, name: workspace.name })
      .from(workspace)
      .where(eq(workspace.organizationId, ws.organizationId))
      .orderBy(asc(workspace.createdAt)),
    invitedBy(ws.organizationId, person.userId),
  ]);
  const tab = rawTab === "manage" ? "manage" : "workspaces";
  const adminOf = mine.filter((w) => w.organizationId === ws.organizationId && w.wsRole === "admin").map((w) => w.workspaceId);
  return (
    <div>
      <CrumbLast text={person.name || `@${person.username}`} />
      <ErrorNote error={error} />
      <AccountPersonPage
        p={person}
        me={user.id}
        tab={tab}
        base={accountHref(ws)}
        back={accountHref(ws, `/members/${person.username ?? person.userId}${tab === "manage" ? "?tab=manage" : ""}`)}
        accountSlug={ws.organizationSlug}
        personal={ws.organizationKind === "personal"}
        canManage={ws.orgRole === "owner"}
        adminOf={adminOf}
        allWorkspaces={allWs}
        added={added ? { person: added.person, at: added.at.toISOString() } : null}
      />
    </div>
  );
}
