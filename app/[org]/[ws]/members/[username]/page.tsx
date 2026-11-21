import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { RequestCard } from "../../../../../components/activity/RequestCard";
import { CrumbLast } from "../../../../../components/AppShell";
import { ErrorNote, WsMemberPage } from "../../../../../components/Members";
import { db } from "../../../../../db";
import { workspaceMember } from "../../../../../db/schema";
import { listRequests } from "../../../../../lib/activity";
import { accountHref, hrefIn, requireWorkspace } from "../../../../../lib/guard";
import { accountPeople, invitedBy, personUrls, workspacePeople } from "../../../../../lib/members";

// One member of this workspace (/<username>/<workspace>/members/<their
// username>): their latest calls here (the Activity cards), the MCP URLs
// they're connected through, and Manage (who added them, role, the
// account, remove from the workspace).
export default async function WorkspaceMemberRoute({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ tab?: string; error?: string }>;
}) {
  const { user, ws } = await requireWorkspace();
  const key = decodeURIComponent((await params).username);
  const { tab: rawTab, error } = await searchParams;
  const { here } = await workspacePeople(ws.organizationId, ws.workspaceId, user.id);
  const p = here.find((m) => m.username === key || m.userId === key);
  if (!p) notFound();
  const tab = rawTab === "urls" ? "urls" : rawTab === "manage" ? "manage" : "calls";
  const base = hrefIn(ws);

  const [cards, urls, added, row, people] = await Promise.all([
    tab === "calls" && p.username ? listRequests({ userId: user.id, ws }, { limit: 5, personUsername: p.username }) : Promise.resolve([]),
    tab === "urls" ? personUrls(ws.workspaceId, p.userId) : Promise.resolve([]),
    tab === "manage" ? invitedBy(ws.organizationId, p.userId, ws.workspaceId) : Promise.resolve(null),
    tab === "manage"
      ? db.query.workspaceMember.findFirst({ where: and(eq(workspaceMember.workspaceId, ws.workspaceId), eq(workspaceMember.userId, p.userId)) })
      : Promise.resolve(undefined),
    tab === "manage" ? accountPeople(ws.organizationId, user.id) : Promise.resolve([]),
  ]);
  const inAccount = people.find((x) => x.userId === p.userId);
  const slug = p.username ?? p.userId;

  return (
    <div>
      <CrumbLast text={p.name || `@${p.username}`} />
      <ErrorNote error={error} />
      <WsMemberPage
        p={p}
        me={user.id}
        tab={tab}
        calls={
          cards.length > 0 ? (
            <div className="zq-mb-calls">
              {cards.map((c) => (
                <RequestCard key={c.id} card={c} linked base={base} />
              ))}
            </div>
          ) : null
        }
        urls={urls}
        added={added ? { person: added.person, at: added.at.toISOString() } : null}
        joined={row ? row.createdAt.toISOString() : null}
        isAdmin={ws.wsRole === "admin"}
        accountSlug={ws.organizationSlug}
        workspaceId={ws.workspaceId}
        workspaceName={ws.workspaceName}
        accountHref={accountHref(ws, `/members/${slug}`)}
        accountWorkspaces={inAccount?.workspaces.map((w) => w.name) ?? []}
        activityHref={p.username ? hrefIn(ws, `/activity?person=${encodeURIComponent(p.username)}`) : null}
        base={base}
        back={hrefIn(ws, `/members/${slug}${tab === "calls" ? "" : `?tab=${tab}`}`)}
      />
    </div>
  );
}
