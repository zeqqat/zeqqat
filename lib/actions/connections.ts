"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { connection, connectionGrant, instance, integration, oauthGrant, oauthToken } from "../../db/schema";
import { CONNECTION_NAME, createConnection, getConnection, replaceConnection, toConnectionName } from "../connections";
import { requireOwner } from "../guard";
import { newId } from "../id";
import { pickablePolicies } from "../policies";

export type ConnFormState = { error?: string };

async function ownedConnection(workspaceId: string, id: string) {
  return db.query.connection.findFirst({
    where: and(eq(connection.id, id), eq(connection.workspaceId, workspaceId), isNull(connection.deletedAt)),
  });
}

// Names say what a connection is for and can never change once created
// (they're part of the URL agents are configured with). They don't have to
// be unique: the short id tells same-named connections apart.
export async function createConnectionAction(_prev: ConnFormState, formData: FormData): Promise<ConnFormState> {
  const { user, ws } = await requireOwner();
  const name = toConnectionName(formData.get("name")?.toString() ?? "");
  const authMode = formData.get("auth_mode")?.toString() === "public" ? "public" : "members";
  const description = (formData.get("description")?.toString() ?? "").trim().slice(0, 140) || null;
  if (!name || !CONNECTION_NAME.test(name)) return { error: "Name it with letters and numbers, for example deploy or reader." };

  const id = await createConnection({
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    name,
    authMode,
    description,
    createdByUserId: user.id,
  });
  revalidatePath("/app/connections");
  redirect(`/app/connections/${id}?created=1`);
}

// Saves the whole policy table in one go: one row per instance, each with
// an "enabled" box, a policy choice ("kinds" or a policy id) and four
// permission boxes used when no policy is attached. A policy must be one
// this workspace may pick, for the instance's integration.
export async function savePolicyAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  const conn = await ownedConnection(ws.workspaceId, id);
  if (!conn) redirect("/app/connections");
  const instances = await db
    .select({ id: instance.id, integrationSlug: integration.slug })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(eq(instance.workspaceId, ws.workspaceId));
  const isPublic = conn.authMode === "public";

  await db.transaction(async (tx) => {
    for (const inst of instances) {
      const on = (k: string) => formData.get(`${inst.id}:${k}`) === "on";
      if (!on("enabled")) {
        await tx.delete(connectionGrant).where(and(eq(connectionGrant.connectionId, conn.id), eq(connectionGrant.instanceId, inst.id)));
        continue;
      }
      const wanted = formData.get(`${inst.id}:policy`)?.toString() ?? "";
      const allowedPolicies = wanted ? await pickablePolicies(ws.workspaceId, inst.integrationSlug) : [];
      const policyId = allowedPolicies.some((p) => p.id === wanted) ? wanted : null;
      const values = {
        policyId,
        allowRead: on("read"),
        // Public callers are capped at read anyway; store what's real.
        allowCreate: !isPublic && on("create"),
        allowEdit: !isPublic && on("edit"),
        allowDelete: !isPublic && on("delete"),
        updatedAt: new Date(),
      };
      await tx
        .insert(connectionGrant)
        .values({ id: newId(), connectionId: conn.id, instanceId: inst.id, ...values })
        .onConflictDoUpdate({ target: [connectionGrant.connectionId, connectionGrant.instanceId], set: values });
    }
  });
  revalidatePath(`/app/connections/${conn.id}`);
  redirect(`/app/connections/${conn.id}?saved=1`);
}

// Switching to public drops every write permission and signs out every
// agent on it (they no longer need tokens); switching to members-only means
// agents must sign in.
export async function setAuthModeAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  const mode = formData.get("auth_mode")?.toString() === "public" ? "public" : "members";
  const conn = await ownedConnection(ws.workspaceId, id);
  if (!conn || conn.authMode === mode) redirect(`/app/connections/${id}`);
  await db.transaction(async (tx) => {
    await tx.update(connection).set({ authMode: mode }).where(eq(connection.id, conn.id));
    if (mode === "public") {
      await tx
        .update(connectionGrant)
        .set({ allowCreate: false, allowEdit: false, allowDelete: false, updatedAt: new Date() })
        .where(eq(connectionGrant.connectionId, conn.id));
      await revokeGrants(tx, conn.id);
    }
  });
  revalidatePath(`/app/connections/${conn.id}`);
  redirect(`/app/connections/${conn.id}?saved=1`);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function revokeGrants(tx: Tx, connectionId: string) {
  const grants = await tx.select({ id: oauthGrant.id }).from(oauthGrant).where(eq(oauthGrant.connectionId, connectionId));
  const now = new Date();
  for (const g of grants) {
    await tx.update(oauthGrant).set({ revokedAt: now }).where(eq(oauthGrant.id, g.id));
    await tx.update(oauthToken).set({ revokedAt: now }).where(eq(oauthToken.grantId, g.id));
  }
}

// Reads a cutoff date from a form (a yyyy-mm-dd date input). The cutoff is
// the end of that day in UTC; "now" (or a date in the past) cuts off at
// once.
function readCutoff(formData: FormData): Date | null {
  const raw = formData.get("cutoff")?.toString().trim() ?? "";
  if (!raw) return null;
  if (raw === "now") return new Date();
  const d = new Date(`${raw}T23:59:59Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Sunsetting a connection (naming doc v2, section 6). Until the cutoff
// everything works, and the server's instructions and every result carry
// the new URL and the date. From the cutoff on, connecting still works so
// the model can explain, but no tools are listed. Tokens are left alone:
// after the cutoff there is nothing they can reach.
export async function sunsetConnectionAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  const message = (formData.get("message")?.toString() ?? "").trim().slice(0, 400) || null;
  const conn = await ownedConnection(ws.workspaceId, id);
  if (!conn) redirect("/app/connections");
  const cutoff = readCutoff(formData);
  if (!cutoff) redirect(`/app/connections/${conn.id}?error=cutoff`);
  await db.update(connection).set({ sunsetAt: cutoff, sunsetMessage: message }).where(eq(connection.id, conn.id));
  revalidatePath("/app/connections");
  redirect(`/app/connections/${conn.id}?sunset=1`);
}

// Replacing a connection: a new one (same name unless changed) with a new
// short id and a copy of the policy. The old one points clients at the new
// URL and, if a cutoff is given, stops serving tools then.
export async function replaceConnectionAction(formData: FormData) {
  const { user, ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  const old = await getConnection(ws.workspaceId, id);
  if (!old) redirect("/app/connections");
  const rawName = formData.get("name")?.toString() ?? "";
  const name = rawName.trim() ? toConnectionName(rawName) : old.name;
  if (!CONNECTION_NAME.test(name)) redirect(`/app/connections/${old.id}?error=name`);
  const message = (formData.get("message")?.toString() ?? "").trim().slice(0, 400) || null;
  const newConnId = await replaceConnection({ old, name, cutoff: readCutoff(formData), message, createdByUserId: user.id });
  revalidatePath("/app/connections");
  redirect(`/app/connections/${newConnId}?replaced=${old.id}`);
}

// Cancels a sunset: the connection is fully live again.
export async function reviveConnectionAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  const conn = await ownedConnection(ws.workspaceId, id);
  if (!conn) redirect("/app/connections");
  await db.update(connection).set({ sunsetAt: null, sunsetMessage: null }).where(eq(connection.id, conn.id));
  revalidatePath("/app/connections");
  redirect(`/app/connections/${conn.id}`);
}

// Deleting is soft: the URL stops answering at all (it looks exactly like
// one that never existed) and every agent on it is signed out, but the row
// stays, so its short id is never reused for the same name in this org.
export async function deleteConnectionAction(formData: FormData) {
  const { ws } = await requireOwner();
  const id = formData.get("connection_id")?.toString() ?? "";
  if (formData.get("confirm")?.toString() !== "delete") redirect(`/app/connections/${id}?error=confirm`);
  const conn = await ownedConnection(ws.workspaceId, id);
  if (!conn) redirect("/app/connections");
  await db.transaction(async (tx) => {
    await tx.update(connection).set({ deletedAt: new Date() }).where(eq(connection.id, conn.id));
    await tx.delete(connectionGrant).where(eq(connectionGrant.connectionId, conn.id));
    await revokeGrants(tx, conn.id);
  });
  revalidatePath("/app/connections");
  redirect("/app/connections?deleted=1");
}
