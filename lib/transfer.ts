import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  connection,
  connectionAlias,
  connectionGrant,
  instance,
  invitation,
  membership,
  oauthGrant,
  organization,
  workspace,
  workspaceMember,
} from "../db/schema";
import { newShortId } from "./connections";
import { newId } from "./id";
import { copyPolicy } from "./policies";

// Moves a workspace, with its instances and connections, from a personal
// namespace into an organization (project doc mcp-context-and-policy-v1,
// section 4), like GitHub's repository transfer. Connection URLs carry the
// namespace, so each one gets a new URL; the old one is kept as an alias,
// keeps working, and tells every client the new URL. Tokens stay valid:
// they belong to the connection, not to its URL.
export async function transferWorkspace(params: { workspaceId: string; toOrganizationId: string; userId: string }) {
  const ws = await db.query.workspace.findFirst({ where: eq(workspace.id, params.workspaceId) });
  if (!ws) throw new Error("workspace not found");
  const [from, to] = await Promise.all([
    db.query.organization.findFirst({ where: eq(organization.id, ws.organizationId) }),
    db.query.organization.findFirst({ where: eq(organization.id, params.toOrganizationId) }),
  ]);
  if (!from || !to) throw new Error("namespace not found");
  if (from.kind !== "personal" || to.kind !== "organization") throw new Error("only personal to organization transfers");
  if (from.ownerUserId !== params.userId) throw new Error("not the owner");
  const ownsTarget = await db.query.membership.findFirst({
    where: and(eq(membership.organizationId, to.id), eq(membership.userId, params.userId), eq(membership.role, "owner")),
  });
  if (!ownsTarget) throw new Error("not an owner of the target");

  await db.transaction(async (tx) => {
    // The workspace slug is unique per org.
    const slugs = (await tx.select({ slug: workspace.slug }).from(workspace).where(eq(workspace.organizationId, to.id))).map((r) => r.slug);
    let slug = ws.slug;
    for (let i = 2; slugs.includes(slug); i++) slug = `${ws.slug}_${i}`;
    await tx.update(workspace).set({ organizationId: to.id, slug }).where(eq(workspace.id, ws.id));

    const conns = await tx.select().from(connection).where(eq(connection.workspaceId, ws.id));
    for (const c of conns) {
      if (!c.deletedAt) {
        await tx
          .insert(connectionAlias)
          .values({ id: newId(), organizationId: from.id, name: c.name, shortId: c.shortId, connectionId: c.id })
          .onConflictDoNothing();
      }
      // (org, name, short id) is unique: pick a free short id in the target.
      let shortId = c.shortId;
      for (let i = 0; i < 20; i++) {
        const taken = await tx
          .select({ id: connection.id })
          .from(connection)
          .where(and(eq(connection.organizationId, to.id), eq(connection.name, c.name), eq(connection.shortId, shortId)))
          .limit(1);
        if (!taken.length) break;
        shortId = newShortId(i < 10 ? 4 : 6);
      }
      await tx.update(connection).set({ organizationId: to.id, shortId }).where(eq(connection.id, c.id));
    }

    // Agent sign-ins keep working; their context now names the organization.
    await tx.update(oauthGrant).set({ organizationId: to.id }).where(eq(oauthGrant.workspaceId, ws.id));

    // Everyone working in the workspace becomes a member of the organization,
    // which is what lets them keep opening it.
    const people = await tx.select({ userId: workspaceMember.userId }).from(workspaceMember).where(eq(workspaceMember.workspaceId, ws.id));
    for (const p of people) {
      await tx.insert(membership).values({ id: newId(), userId: p.userId, organizationId: to.id, role: "member" }).onConflictDoNothing();
    }

    // A personal namespace always keeps a workspace of its own.
    const left = await tx.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, from.id)).limit(1);
    if (!left.length) {
      await tx.insert(workspace).values({ id: newId(), organizationId: from.id, slug: "default", name: "Default", setupCompletedAt: new Date() });
    }

    // Open invites pointed at the old namespace.
    await tx
      .update(invitation)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitation.workspaceId, ws.id), isNull(invitation.acceptedAt), isNull(invitation.revokedAt)));
  });

  // Policies belong to a namespace: the ones this workspace uses are copied
  // into the organization and the grants point at the copies.
  const used = await db
    .selectDistinct({ policyId: connectionGrant.policyId })
    .from(connectionGrant)
    .innerJoin(instance, eq(instance.id, connectionGrant.instanceId))
    .where(and(eq(instance.workspaceId, ws.id), isNotNull(connectionGrant.policyId)));
  for (const u of used) {
    if (!u.policyId) continue;
    const copyId = await copyPolicy({ sourceId: u.policyId, organizationId: to.id, userId: params.userId, workspaceId: ws.id });
    const instanceIds = (await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, ws.id))).map((r) => r.id);
    if (instanceIds.length) {
      await db
        .update(connectionGrant)
        .set({ policyId: copyId })
        .where(and(eq(connectionGrant.policyId, u.policyId), inArray(connectionGrant.instanceId, instanceIds)));
    }
  }
  return { organizationId: to.id, organizationSlug: to.slug };
}
