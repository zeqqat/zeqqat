import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { SelfHostFlow } from "../../../../components/SelfHostFlow";
import { db } from "../../../../db";
import { instance, integration, user, workspace, workspaceInstance } from "../../../../db/schema";
import { siteHost } from "../../../../lib/edition";
import { accountHref, requireOrgOwner } from "../../../../lib/guard";
import { installsOf, isRecent } from "../../../../lib/selfhost-installs";
import { personalAccountOf } from "../../../../lib/setup";

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Install Zeqqat on your own Dokploy, from the account: Dokploy instances
// belong to the account, not to a workspace. Owners only.
export default async function SelfHostPage() {
  const { user: me, acct } = await requireOrgOwner();
  const rows = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      keyHint: instance.keyHint,
      createdAt: instance.createdAt,
      addedBy: user.name,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .leftJoin(user, eq(user.id, instance.createdByUserId))
    .where(and(eq(instance.organizationId, acct.organizationId), eq(integration.slug, "dokploy")));
  if (rows.length === 0) redirect(accountHref(acct, "/dokploy-instances"));

  const used = await db
    .select({ inst: workspaceInstance.instanceId, ws: workspace.id })
    .from(workspaceInstance)
    .innerJoin(workspace, eq(workspace.id, workspaceInstance.workspaceId))
    .where(inArray(workspaceInstance.instanceId, rows.map((r) => r.id)));
  const own = await personalAccountOf(me.id);
  const [u] = await db.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, me.id));

  const instances = rows.map((r) => ({
    id: r.id,
    alias: r.alias,
    host: r.baseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
    keyHint: r.keyHint,
    added: `Added ${day(r.createdAt)}${r.addedBy ? ` by ${r.addedBy}` : ""}`,
    workspaces: used.filter((x) => x.inst === r.id).length,
  }));
  // The latest install still worth showing: not claimed yet, or claimed in
  // the last 7 days (Settings has the rest).
  const last = (await installsOf(acct.organizationId)).find((i) => isRecent(i));
  const saved = last
    ? {
        installId: last.id,
        address: last.address,
        claimUrl: last.claimUrl,
        claimToken: last.claimToken,
        claimedOn: last.claimedAt ? day(last.claimedAt) : null,
        ownKey: last.ownKey,
        keyChoice: last.keyChoice ?? (last.keyDeletedAt ? "deleted" : null),
        instanceId: last.instanceId,
        alias: last.instanceAlias ?? "",
        keyHint: last.keyHint,
        workspaces: instances.find((i) => i.id === last.instanceId)?.workspaces ?? 0,
      }
    : null;
  return (
    <>
      <SelfHostFlow
        saved={saved}
        instances={instances}
        siteHost={siteHost()}
        owner={{ id: me.id, name: u?.name || own?.slug || "", username: own?.slug ?? acct.organizationSlug, image: u?.image ?? null }}
      />
    </>
  );
}
