"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { connection, connectionGrant, instance, integration, organization, policy, usernameAlias, workspace } from "../../db/schema";
import { requireOrgOwner } from "../guard";
import { deleteInstances } from "../instance-ops";
import { accountBase } from "../paths";
import { isReserved, isValidOrgSlug, normalizeSlug } from "../username";
import { heldByOldUsername } from "../username-alias";
import { homePathFor } from "../workspace";

// An organization's Settings (app/[org]/(account)/settings): name, username
// and delete. Owners only. A personal account's name and username are the
// person's profile, edited on /account (lib/actions/account.ts).

function pgCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

async function ownedOrg() {
  const { user, ws } = await requireOrgOwner();
  const back = accountBase(ws.organizationSlug) + "/settings";
  if (ws.organizationKind !== "organization") redirect(back);
  return { user, ws, back };
}

export async function renameOrgAction(formData: FormData) {
  const { ws, back } = await ownedOrg();
  const name = (formData.get("name")?.toString() ?? "").trim().slice(0, 60);
  if (!name) redirect(`${back}?error=name`);
  await db.update(organization).set({ displayName: name }).where(eq(organization.id, ws.organizationId));
  revalidatePath("/", "layout");
  redirect(`${back}?saved=1`);
}

// Same rules as a person's username: the old one keeps redirecting
// (username_alias), so MCP URLs, links and tool names keep working.
export async function changeOrgUsernameAction(formData: FormData) {
  const { ws, back } = await ownedOrg();
  const raw = (formData.get("username")?.toString() ?? "").trim().replace(/^@/, "");
  const slug = normalizeSlug(raw);
  if (slug === ws.organizationSlug) redirect(back);
  if (raw !== slug || !isValidOrgSlug(slug)) redirect(`${back}?tab=general&error=username`);
  if (isReserved(slug)) redirect(`${back}?tab=general&error=reserved`);
  const taken = await db.query.organization.findFirst({ where: eq(organization.slug, slug) });
  if (taken || (await heldByOldUsername(slug, db, ws.organizationId))) redirect(`${back}?tab=general&error=taken`);
  try {
    await db.transaction(async (tx) => {
      await tx.delete(usernameAlias).where(eq(usernameAlias.slug, slug));
      await tx.update(organization).set({ slug }).where(eq(organization.id, ws.organizationId));
      await tx.insert(usernameAlias).values({ slug: ws.organizationSlug, organizationId: ws.organizationId }).onConflictDoNothing();
    });
  } catch (err) {
    if (pgCode(err) === "23505") redirect(`${back}?tab=general&error=taken`);
    throw err;
  }
  revalidatePath("/", "layout");
  redirect(`${accountBase(slug)}/settings?saved=1`);
}

// Deletes the organization and everything in it. Refused while it publishes
// integrations or while MCP URLs in other accounts use its policies, since
// deleting would break other people's setups.
export async function deleteOrgAction(formData: FormData) {
  const { user, ws, back } = await ownedOrg();
  if (formData.get("confirm")?.toString() !== ws.organizationSlug) redirect(`${back}?tab=delete&error=confirm`);
  const orgId = ws.organizationId;

  const [published] = await db.select({ id: integration.id }).from(integration).where(eq(integration.organizationId, orgId)).limit(1);
  if (published) redirect(`${back}?tab=delete&error=published`);
  const [usedElsewhere] = await db
    .select({ id: connectionGrant.connectionId })
    .from(connectionGrant)
    .innerJoin(policy, eq(policy.id, connectionGrant.policyId))
    .innerJoin(connection, eq(connection.id, connectionGrant.connectionId))
    .where(and(eq(policy.organizationId, orgId), ne(connection.organizationId, orgId)))
    .limit(1);
  if (usedElsewhere) redirect(`${back}?tab=delete&error=policies_used`);

  // Workspaces first (their instances' keys, MCP URLs and grants go with
  // them), then the organization, which takes its policies and the rest.
  const wss = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.organizationId, orgId));
  for (const w of wss) {
    const ids = (await db.select({ id: instance.id }).from(instance).where(eq(instance.workspaceId, w.id))).map((r) => r.id);
    await deleteInstances(w.id, ids);
  }
  if (wss.length) await db.delete(workspace).where(inArray(workspace.id, wss.map((w) => w.id)));
  await db.delete(organization).where(eq(organization.id, orgId));
  revalidatePath("/", "layout");
  redirect(await homePathFor(user.id));
}
