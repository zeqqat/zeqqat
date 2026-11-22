"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "../../db";
import { instance, integration, user, workspace, workspaceInstance } from "../../db/schema";
import { decryptCredential, encryptCredential, type EncryptedCredential } from "../crypto";
import { normalizeBaseUrl } from "../dokploy-check";
import { requireOrgOwner } from "../guard";
import { keyHint } from "../key-hint";
import { personalAccountOf } from "../setup";
import { claimHash, encodeSeed, SEED_ENV } from "../selfhost-seed";
import {
  configureStep,
  createKeyStep,
  createStep,
  deployStep,
  InstallError,
  previewAddress,
  statusStep,
  type Created,
  type InstallStatus,
  type Target,
} from "../selfhost-install";

// The one-button install: Zeqqat installs itself into the account's Dokploy
// with the key it already holds. No agent: the steps are always the same,
// so they run as plain code (lib/selfhost-install.ts). The page calls these
// in order and shows each step as it finishes. Secrets are generated on the
// server and sent straight to Dokploy; they never reach the browser (the
// new install's key travels between steps sealed with this site's own
// encryption key). The new install is seeded (lib/selfhost-seed.ts) so the
// person lands on "Connect your agent" instead of setting up again.

type Fail = { ok: false; error: string };

async function owned(instanceId: string) {
  const { user: me, acct } = await requireOrgOwner();
  const [row] = await db
    .select({
      id: instance.id,
      alias: instance.alias,
      baseUrl: instance.baseUrl,
      credential: instance.credential,
      lastVersion: instance.lastVersion,
      slug: integration.slug,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(and(eq(instance.id, instanceId), eq(instance.organizationId, acct.organizationId)));
  if (!row || row.slug !== "dokploy") throw new InstallError("That Dokploy instance isn't in this account.");
  const baseUrl = normalizeBaseUrl(row.baseUrl);
  if (!baseUrl) throw new InstallError("This instance's Dokploy URL isn't valid. Update it on the instance page.");
  return { me, acct, row, target: { baseUrl, apiKey: decryptCredential(row.credential) } as Target };
}

async function target(instanceId: string): Promise<Target> {
  return (await owned(instanceId)).target;
}

async function run<T>(fn: () => Promise<T>): Promise<T | Fail> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InstallError) return { ok: false, error: err.message };
    // redirect() from the guard must keep working.
    throw err;
  }
}

// The free address, before anything is created: the page shows it and the
// install then uses exactly that one.
export async function installPreview(instanceId: string): Promise<{ ok: true; host: string } | Fail> {
  return run(async () => ({ ok: true as const, host: await previewAddress(await target(instanceId)) }));
}

export async function installCreate(instanceId: string, host?: string): Promise<Created | Fail> {
  return run(async () => createStep(await target(instanceId), host));
}

// A Dokploy key of the install's own. `sealed` is it, encrypted with this
// site's key, for installConfigure; null when this Dokploy can't make one,
// and the install then gets the same key zeqqat.com uses.
export type KeyResult = { ok: true; sealed: string | null };

export async function installKey(instanceId: string): Promise<KeyResult | Fail> {
  return run(async () => {
    const key = await createKeyStep(await target(instanceId));
    return { ok: true as const, sealed: key ? JSON.stringify(encryptCredential(key)) : null };
  });
}

export type ConfigureResult = { ok: true; address: string; claimUrl: string; ownKey: boolean };

export async function installConfigure(
  instanceId: string,
  composeId: string,
  appName: string,
  host: string | undefined,
  sealed: string | null,
): Promise<ConfigureResult | Fail> {
  return run(async () => {
    const { me, acct, row, target: t } = await owned(instanceId);
    let newKey: string | null = null;
    if (sealed) {
      try {
        newKey = decryptCredential(JSON.parse(sealed) as EncryptedCredential);
      } catch {
        throw new InstallError("The new key didn't come through. Start the install again.");
      }
    }
    const apiKey = newKey ?? t.apiKey;
    const encryptionKey = randomBytes(32).toString("base64");
    const token = randomBytes(32).toString("base64url");
    const own = await personalAccountOf(me.id);
    const [u] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, me.id));
    const used = (await db.select({ ws: workspaceInstance.workspaceId }).from(workspaceInstance).where(eq(workspaceInstance.instanceId, row.id))).map(
      (r) => r.ws,
    );
    const wss = used.length
      ? await db
          .select({ slug: workspace.slug, name: workspace.name })
          .from(workspace)
          .where(and(eq(workspace.organizationId, acct.organizationId), inArray(workspace.id, used)))
      : [];
    const seed = encodeSeed({
      v: 1,
      claim: claimHash(token),
      owner: { email: u.email, name: u.name || acct.organizationName, username: own?.slug ?? acct.organizationSlug },
      instance: {
        alias: row.alias,
        baseUrl: row.baseUrl,
        credential: encryptCredential(apiKey, encryptionKey),
        keyHint: keyHint(apiKey),
        lastVersion: row.lastVersion,
      },
      workspaces: wss,
      composeId,
    });
    const r = await configureStep(t, composeId, appName, host, { encryptionKey, env: { [SEED_ENV]: seed } });
    return { ...r, claimUrl: `${r.address}/claim/${token}`, ownKey: !!newKey };
  });
}

export async function installDeploy(instanceId: string, composeId: string) {
  return run(async () => deployStep(await target(instanceId), composeId));
}

export async function installStatus(instanceId: string, composeId: string, address: string): Promise<InstallStatus | Fail> {
  return run(async () => statusStep(await target(instanceId), composeId, address));
}

// "Deactivate the key": zeqqat.com stops using the key it holds for this
// instance. The instance, its workspaces, policies and Activity all stay;
// the key stays too, as a log of what zeqqat.com used and when it stopped,
// shown on the instance's Manage tab. Dokploy has no way to switch a key
// off over its API, so the key itself keeps working there until it is
// deleted in Dokploy.
export async function deactivateCloudKey(instanceId: string, address: string): Promise<{ ok: true } | Fail> {
  return run(async () => {
    const { acct, row } = await owned(instanceId);
    let host = address;
    try {
      host = new URL(address).host;
    } catch {
      // keep what came
    }
    await db
      .update(instance)
      .set({ keyDeactivatedAt: new Date(), keyDeactivatedFor: host.slice(0, 200) })
      .where(and(eq(instance.id, row.id), eq(instance.organizationId, acct.organizationId)));
    revalidatePath(`/${acct.organizationSlug}/dokploy-instances/${row.id}`);
    return { ok: true as const };
  });
}
