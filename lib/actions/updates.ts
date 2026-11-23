"use server";

import { adminTargets } from "../admin-targets";
import { checkNow, forgetRemote, releaseStatus, type ReleaseStatus } from "../changelog";
import { edition, siteHost } from "../edition";
import { requireUser } from "../guard";
import { deploySelf, deployState, findSelfCompose, type DeployState, type SelfCompose } from "../self-update";
import { DokployRateLimited, InstallError } from "../selfhost-install";
import { listUserWorkspaces } from "../workspace";

// The footer's version pill and its What's new modal. Anyone signed in can
// see what changed; only a workspace admin on a self-hosted install can
// update, and only through a Dokploy instance they already manage.

export async function getReleaseStatus(): Promise<ReleaseStatus> {
  await requireUser();
  return releaseStatus();
}

export async function checkForUpdates(): Promise<ReleaseStatus> {
  await requireUser();
  return checkNow();
}

export type UpdateRoute =
  | { kind: "ready" }
  | { kind: "cloud" }
  | { kind: "not_admin" }
  | { kind: "no_dokploy" } // no Dokploy instance here runs this install
  | { kind: "rate_limited" } // Dokploy turned the key away (its rate limit)
  | { kind: "pinned"; version: string };


async function locate(): Promise<{ route: UpdateRoute; self?: SelfCompose }> {
  if (edition() === "cloud") return { route: { kind: "cloud" } };
  const user = await requireUser();
  const targets = await adminTargets(user.id);
  if (!targets.length) {
    const isAdmin = (await listUserWorkspaces(user.id)).some((w) => w.wsRole === "admin");
    return { route: { kind: isAdmin ? "no_dokploy" : "not_admin" } };
  }
  let self: SelfCompose | null;
  try {
    self = await findSelfCompose(targets, siteHost());
  } catch (err) {
    if (err instanceof DokployRateLimited) return { route: { kind: "rate_limited" } };
    throw err;
  }
  if (!self) return { route: { kind: "no_dokploy" } };
  if (self.pinned) return { route: { kind: "pinned", version: self.pinned } };
  return { route: { kind: "ready" }, self };
}

export async function getUpdateRoute(): Promise<UpdateRoute> {
  return (await locate()).route;
}

export async function startUpdate(): Promise<{ ok: true; composeId: string } | { ok: false; error: string }> {
  const { route, self } = await locate();
  if (route.kind !== "ready" || !self) return { ok: false, error: "This install can't update from here." };
  const status = await releaseStatus();
  if (!status.updateAvailable) return { ok: false, error: "You're already on the latest version." };
  try {
    await deploySelf(self, status.latest, siteHost());
  } catch (err) {
    if (err instanceof InstallError) return { ok: false, error: err.message };
    throw err;
  }
  forgetRemote();
  return { ok: true, composeId: self.composeId };
}

// Polled by the modal while the update runs. Only reads, and only through
// Dokploy instances the caller already administers.
export async function getUpdateDeploy(composeId: string): Promise<DeployState | null> {
  if (edition() === "cloud" || typeof composeId !== "string" || !/^[\w-]{1,64}$/.test(composeId)) return null;
  const user = await requireUser();
  return deployState(await adminTargets(user.id), composeId);
}
