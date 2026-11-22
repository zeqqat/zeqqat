"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "../../db";
import { instance, integration, workspace } from "../../db/schema";
import { decryptCredential, encryptCredential } from "../crypto";
import { keyHint } from "../key-hint";
import { CONNECTION_MESSAGES, normalizeBaseUrl, testDokployConnection } from "../dokploy-check";
import { primaryConnection } from "../connections";
import { accountHref, here, hrefIn, requireAccount, requireOrgOwner, requireOwner, requireWorkspaceOrgOwner } from "../guard";
import { newId } from "../id";
import { deleteInstances, giveInstance, takeInstance } from "../instance-ops";
import { syncOfficialCatalog } from "../official-catalog";
import { testAppConnection } from "../spec-import";

export type ConnectState = { error?: string; values?: { alias: string; baseUrl: string } };

// Where an instance form came from: Setup and the account's Dokploy
// Instances page add it to the account only; a workspace page also gives
// it to that workspace.
type Next = "setup" | "account" | "dokploy-instances" | "overview";
function nextOf(formData: FormData): Next {
  const n = formData.get("next")?.toString();
  return n === "setup" || n === "account" || n === "dokploy-instances" ? n : "overview";
}

// Dashes or underscores, both fine: people name servers both ways
// (prod-eu-1, dev_test_2), and the name is only a label agents pass back.
const ALIAS = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function pgCode(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

// Tests the key first and saves only if Dokploy accepted it, so a typo
// never becomes a saved instance that fails on the agent's first call.
// Every new instance gets a workspace-default grant (read, create and edit
// on, delete off): without one, the executor allows nothing.
export async function connectDokployAction(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { user, acct, ws } = await requireOrgOwner();
  const nx = nextOf(formData);
  // From a workspace's pages it also joins that workspace.
  const toWorkspace = (nx === "dokploy-instances" || nx === "overview") && ws ? ws : null;
  const base = ws ? hrefIn(ws) : accountHref(acct);

  const alias = (formData.get("alias")?.toString() ?? "").trim().toLowerCase();
  const baseUrlRaw = (formData.get("base_url")?.toString() ?? "").trim();
  const apiKey = (formData.get("api_key")?.toString() ?? "").trim();
  const next =
    nx === "setup" ? accountHref(acct, "/setup") : nx === "account" || !toWorkspace ? accountHref(acct, "/dokploy-instances") : nx === "dokploy-instances" ? `${base}/dokploy-instances` : base;
  const values = { alias, baseUrl: baseUrlRaw };

  if (!alias || !baseUrlRaw || !apiKey) return { error: "Fill in the name, the URL and the API key.", values };
  if (!ALIAS.test(alias)) {
    return { error: "Use lowercase letters, numbers, dashes or underscores for the name, for example my-dokploy.", values };
  }

  const findDokploy = () =>
    db.query.integration.findFirst({ where: and(eq(integration.slug, "dokploy"), eq(integration.official, true)) });
  let dokploy = await findDokploy();
  if (!dokploy) {
    // A fresh install has no users at startup, so the official catalog is
    // imported the first time someone adds an instance.
    await syncOfficialCatalog().catch((err) => console.error("[zeqqat] official catalog sync failed:", err));
    dokploy = await findDokploy();
  }
  if (!dokploy) return { error: "Dokploy isn't set up on this Zeqqat yet. Its tool catalog is missing.", values };

  const result = await testDokployConnection(baseUrlRaw, apiKey);
  if (result.status !== "ok") return { error: CONNECTION_MESSAGES[result.status], values };

  const instanceId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(instance).values({
        id: instanceId,
        organizationId: acct.organizationId,
        integrationId: dokploy.id,
        alias,
        baseUrl: result.baseUrl!,
        credential: encryptCredential(apiKey),
      keyHint: keyHint(apiKey),
        lastValidatedAt: new Date(),
        lastVersion: result.version ?? null,
        lastStatus: "ok",
        createdByUserId: user.id,
      });
      if (toWorkspace) await giveInstance(tx, toWorkspace.workspaceId, instanceId);
    });
    // First instance in a workspace: make sure it has a URL to hand out.
    if (toWorkspace) await primaryConnection(toWorkspace, user.id);
  } catch (err) {
    if (pgCode(err) === "23505") return { error: `You already have an instance called "${alias}". Pick another name.`, values };
    throw err;
  }

  revalidatePath("/", "layout");
  redirect(`${next}?connected=${encodeURIComponent(alias)}`);
}

// An instance of any other integration: an app imported from its spec,
// visible to this workspace's org. Saved once its address answers; the key
// is checked by the first real call.
export async function connectAppAction(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const base = await here();
  const { user, ws } = await requireWorkspaceOrgOwner();

  const integrationId = formData.get("integration_id")?.toString() ?? "";
  const alias = (formData.get("alias")?.toString() ?? "").trim().toLowerCase();
  const baseUrlRaw = (formData.get("base_url")?.toString() ?? "").trim();
  const apiKey = (formData.get("api_key")?.toString() ?? "").trim();
  const values = { alias, baseUrl: baseUrlRaw };

  const integ = await db.query.integration.findFirst({ where: eq(integration.id, integrationId) });
  if (!integ || (!integ.official && integ.organizationId !== ws.organizationId)) {
    return { error: "That app isn't in this account's catalog.", values };
  }
  if (!alias || !baseUrlRaw) return { error: "Fill in the name and the URL.", values };
  if (!ALIAS.test(alias)) {
    return { error: "Use lowercase letters, numbers, dashes or underscores for the name, for example my-dokploy.", values };
  }

  const result = await testAppConnection(baseUrlRaw);
  if (result.status !== "ok") return { error: result.message, values };

  const instanceId = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(instance).values({
        id: instanceId,
        organizationId: ws.organizationId,
        integrationId: integ.id,
        alias,
        baseUrl: result.baseUrl!,
        credential: encryptCredential(apiKey),
      keyHint: keyHint(apiKey),
        lastValidatedAt: new Date(),
        lastStatus: "ok",
        createdByUserId: user.id,
      });
      await giveInstance(tx, ws.workspaceId, instanceId);
    });
    await primaryConnection(ws, user.id);
  } catch (err) {
    if (pgCode(err) === "23505") return { error: `You already have an instance called "${alias}". Pick another name.`, values };
    throw err;
  }

  revalidatePath(`${base}`, "layout");
  redirect(`${base}/dokploy-instances?connected=${encodeURIComponent(alias)}`);
}

async function isDokploy(integrationId: string) {
  const integ = await db.query.integration.findFirst({ where: eq(integration.id, integrationId) });
  return integ?.slug === "dokploy" && integ.official;
}

// Instances belong to the account: any of the account's, whichever page
// the form is on.
async function ownedInstance(organizationId: string, instanceId: string) {
  return db.query.instance.findFirst({
    where: and(eq(instance.id, instanceId), eq(instance.organizationId, organizationId)),
  });
}

// The page the form sits on: the account's Dokploy Instances (base=account)
// or the current workspace's.
async function pageBase(formData: FormData) {
  const { acct, ws } = await requireAccount();
  return formData.get("base")?.toString() === "account" || !ws ? accountHref(acct) : hrefIn(ws);
}

export async function replaceKeyAction(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { acct: ws } = await requireOrgOwner();
  const base = await pageBase(formData);
  const instanceId = formData.get("instance_id")?.toString() ?? "";
  const apiKey = (formData.get("api_key")?.toString() ?? "").trim();
  const inst = await ownedInstance(ws.organizationId, instanceId);
  if (!inst) redirect(`${base}/dokploy-instances`);
  if (!apiKey) return { error: "Paste the new API key." };

  const result = (await isDokploy(inst.integrationId))
    ? await testDokployConnection(inst.baseUrl, apiKey)
    : { ...(await testAppConnection(inst.baseUrl)), version: undefined };
  if (result.status !== "ok") {
    return { error: "message" in result && result.message ? result.message : CONNECTION_MESSAGES[result.status as keyof typeof CONNECTION_MESSAGES] };
  }

  await db
    .update(instance)
    .set({
      credential: encryptCredential(apiKey),
      keyHint: keyHint(apiKey),
      lastValidatedAt: new Date(),
      lastVersion: result.version ?? inst.lastVersion,
      lastStatus: "ok",
      keyDeletedAt: null,
      keyDeletedFor: null,
    })
    .where(eq(instance.id, inst.id));

  revalidatePath(`${base}/dokploy-instances/${inst.id}`);
  redirect(`${base}/dokploy-instances/${inst.id}?tab=manage&key=replaced`);
}

// Re-runs the connection test with the stored key, so the status badge
// reflects today rather than the day the instance was added.
export async function retestInstanceAction(formData: FormData) {
  const { ws } = await requireOwner();
  const base = await pageBase(formData);
  const inst = await ownedInstance(ws.organizationId, formData.get("instance_id")?.toString() ?? "");
  if (!inst) redirect(`${base}/dokploy-instances`);

  let status: string;
  let version = inst.lastVersion;
  try {
    if (await isDokploy(inst.integrationId)) {
      const result = await testDokployConnection(inst.baseUrl, decryptCredential(inst.credential));
      status = result.status;
      if (result.version) version = result.version;
    } else {
      const result = await testAppConnection(inst.baseUrl);
      status = result.status === "ok" ? "ok" : "unreachable";
    }
  } catch {
    status = "unreachable";
  }

  await db
    .update(instance)
    .set({ lastValidatedAt: new Date(), lastStatus: status, lastVersion: version })
    .where(eq(instance.id, inst.id));

  revalidatePath(`${base}/dokploy-instances/${inst.id}`);
  revalidatePath(`${base}/dokploy-instances`);
  redirect(`${base}/dokploy-instances/${inst.id}?tab=manage&checked=1`);
}

// Asks Dokploy to update itself to its latest release (its own
// settings.updateServer, the same as its Update button). Dokploy pulls the
// new image and restarts, so agents get errors for a minute or two. Owners
// only, behind a confirm on the instance's Manage tab.
export async function updateDokployAction(formData: FormData) {
  const { acct: ws } = await requireOrgOwner();
  const here_ = await pageBase(formData);
  const inst = await ownedInstance(ws.organizationId, formData.get("instance_id")?.toString() ?? "");
  if (!inst) redirect(`${here_}/dokploy-instances`);
  const page = `${here_}/dokploy-instances/${inst.id}?tab=manage`;
  const base = (await isDokploy(inst.integrationId)) ? normalizeBaseUrl(inst.baseUrl) : null;
  if (!base) redirect(`${page}&error=update`);
  let ok = false;
  try {
    const res = await fetch(`${base}/api/settings.updateServer`, {
      method: "POST",
      headers: { "x-api-key": decryptCredential(inst.credential), accept: "application/json", "content-type": "application/json" },
      body: "{}",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    ok = res.ok;
  } catch {
    // Dokploy can drop the connection as it restarts: that still means it started.
    ok = true;
  }
  revalidatePath(`${here_}/dokploy-instances/${inst.id}`);
  redirect(ok ? `${page}&updating=1` : `${page}&error=update`);
}

// Deleting the row removes the encrypted key and, by cascade, every grant
// for it. call_log rows keep their history: their instance_id is a plain
// reference, so it's cleared first rather than blocking the delete.
export async function removeInstanceAction(formData: FormData) {
  const { acct: ws } = await requireOrgOwner();
  const base = await pageBase(formData);
  const inst = await ownedInstance(ws.organizationId, formData.get("instance_id")?.toString() ?? "");
  if (!inst) redirect(`${base}/dokploy-instances`);
  // The Manage tab asks for the instance's name before removing it.
  if ((formData.get("confirm")?.toString() ?? "").trim() !== inst.alias) {
    redirect(`${base}/dokploy-instances/${inst.id}?tab=manage&error=confirm`);
  }

  await deleteInstances(ws.organizationId, [inst.id]);

  revalidatePath("/", "layout");
  redirect(`${base}/dokploy-instances?removed=1`);
}

// The account owner decides which workspaces use an instance (the toggles
// on its Workspaces tab, and the workspace's "Add an instance").
export async function setInstanceWorkspaceAction(formData: FormData) {
  const { acct: ws, ws: cur } = await requireOrgOwner();
  const inst = await ownedInstance(ws.organizationId, formData.get("instance_id")?.toString() ?? "");
  const target = formData.get("workspace_id")?.toString() ?? "";
  const on = formData.get("on")?.toString() === "on";
  const back = formData.get("back")?.toString() === "workspace" && cur ? hrefIn(cur, "/dokploy-instances") : accountHref(ws, `/dokploy-instances/${inst?.id ?? ""}?tab=workspaces`);
  if (!inst) redirect(accountHref(ws, "/dokploy-instances"));
  const [w] = await db.select({ id: workspace.id }).from(workspace).where(and(eq(workspace.id, target), eq(workspace.organizationId, ws.organizationId)));
  if (!w) redirect(back);
  await db.transaction(async (tx) => {
    if (on) await giveInstance(tx, w.id, inst.id);
    else await takeInstance(tx, w.id, inst.id);
  });
  revalidatePath("/", "layout");
  redirect(back);
}

// "Add an instance" on a workspace's Dokploy Instances page: some of the
// account's instances, ticked.
export async function giveInstancesAction(formData: FormData) {
  const { ws } = await requireWorkspaceOrgOwner();
  const ids = formData.getAll("instance_id").map(String);
  if (ids.length) {
    const mine = await db.select({ id: instance.id }).from(instance).where(and(eq(instance.organizationId, ws.organizationId), inArray(instance.id, ids)));
    await db.transaction(async (tx) => {
      for (const m of mine) await giveInstance(tx, ws.workspaceId, m.id);
    });
  }
  revalidatePath("/", "layout");
  redirect(hrefIn(ws, "/dokploy-instances"));
}
