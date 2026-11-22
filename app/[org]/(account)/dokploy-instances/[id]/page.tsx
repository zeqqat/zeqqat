import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CrumbLast } from "../../../../../components/AppShell";
import { AccountInstanceView } from "../../../../../components/AccountInstanceView";
import { db } from "../../../../../db";
import { connection, instance, integration, workspace, workspaceInstance } from "../../../../../db/schema";
import { hereAccount, requireAccount } from "../../../../../lib/guard";
import { cardsFor } from "../../../../../lib/instance-cards";

// One instance at the account level: its card, then which workspaces may use
// it (one toggle each, the account owner's call) and Manage.
export default async function AccountInstancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const acct = await hereAccount();
  const { acct: ws } = await requireAccount();
  const { id } = await params;
  const query = await searchParams;
  const [row] = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      credential: instance.credential,
      lastStatus: instance.lastStatus,
      keyDeactivatedAt: instance.keyDeactivatedAt,
      keyDeactivatedFor: instance.keyDeactivatedFor,
      keyHint: instance.keyHint,
      lastVersion: instance.lastVersion,
      lastValidatedAt: instance.lastValidatedAt,
      specVersion: instance.specVersion,
      specCheckedAt: instance.specCheckedAt,
      appSlug: integration.slug,
      appName: integration.name,
      appLogo: integration.logoUrl,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(and(eq(instance.id, id), eq(instance.organizationId, ws.organizationId)))
    .limit(1);
  if (!row) redirect(`${acct}/dokploy-instances`);

  const [wss, given, urls] = await Promise.all([
    db.select({ id: workspace.id, name: workspace.name, slug: workspace.slug }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)).orderBy(asc(workspace.createdAt)),
    db.select({ ws: workspaceInstance.workspaceId }).from(workspaceInstance).where(eq(workspaceInstance.instanceId, row.id)),
    db.select({ ws: connection.workspaceId }).from(connection).where(eq(connection.organizationId, ws.organizationId)),
  ]);
  const on = new Set(given.map((g) => g.ws));
  const workspacesOf = new Map([[row.id, wss.filter((w) => on.has(w.id)).map((w) => w.name)]]);
  const [card] = await cardsFor([row], null, workspacesOf);
  const tab = query.tab === "manage" ? "manage" : "workspaces";

  return (
    <>
      <CrumbLast text={row.alias} />
      <AccountInstanceView
        card={card}
        tab={tab}
        canEdit={ws.orgRole === "owner"}
        error={typeof query.error === "string" ? query.error : null}
        keyRow={{
          start: row.keyHint?.start ?? "",
          end: row.keyHint?.end ?? "",
          deactivatedOn: row.keyDeactivatedAt
            ? row.keyDeactivatedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
            : null,
          deactivatedFor: row.keyDeactivatedFor,
        }}
        workspaces={wss.map((w) => ({ id: w.id, name: w.name, on: on.has(w.id), urls: urls.filter((u) => u.ws === w.id).length }))}
      />
    </>
  );
}
