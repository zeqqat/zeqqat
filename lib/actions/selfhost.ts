"use server";

import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { instance, integration } from "../../db/schema";
import { decryptCredential } from "../crypto";
import { normalizeBaseUrl } from "../dokploy-check";
import { requireOwner } from "../guard";
import {
  configureStep,
  createStep,
  deployStep,
  InstallError,
  statusStep,
  type Created,
  type InstallStatus,
  type Target,
} from "../selfhost-install";

// The one-button install: Zeqqat installs itself into the user's Dokploy
// with the key it already holds. No agent: the steps are always the same,
// so they run as plain code (lib/selfhost-install.ts). The page calls these
// in order and shows each step as it finishes. Secrets are generated on the
// server and sent straight to Dokploy; they never reach the browser.

type Fail = { ok: false; error: string };

async function target(instanceId: string): Promise<Target> {
  const { ws } = await requireOwner();
  const [row] = await db
    .select({
      baseUrl: instance.baseUrl,
      credential: instance.credential,
      slug: integration.slug,
    })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(
      and(
        eq(instance.id, instanceId),
        eq(instance.workspaceId, ws.workspaceId),
      ),
    );
  if (!row || row.slug !== "dokploy")
    throw new InstallError("That Dokploy instance isn't in this workspace.");
  const baseUrl = normalizeBaseUrl(row.baseUrl);
  if (!baseUrl)
    throw new InstallError(
      "This instance's Dokploy URL isn't valid. Update it on the instance page.",
    );
  return { baseUrl, apiKey: decryptCredential(row.credential) };
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

export async function installCreate(
  instanceId: string,
): Promise<Created | Fail> {
  return run(async () => createStep(await target(instanceId)));
}

export async function installConfigure(
  instanceId: string,
  composeId: string,
  appName: string,
) {
  return run(async () =>
    configureStep(await target(instanceId), composeId, appName),
  );
}

export async function installDeploy(instanceId: string, composeId: string) {
  return run(async () => deployStep(await target(instanceId), composeId));
}

export async function installStatus(
  instanceId: string,
  composeId: string,
  address: string,
): Promise<InstallStatus | Fail> {
  return run(async () =>
    statusStep(await target(instanceId), composeId, address),
  );
}
