"use server";

import { adminTargets } from "../admin-targets";
import { forgetRemote, releaseStatus, type ReleaseStatus } from "../changelog";
import { edition, siteHost } from "../edition";
import { requireWorkspace } from "../guard";
import { deploySelf, findSelfCompose, type SelfCompose } from "../self-update";
import { InstallError } from "../selfhost-install";
import { listUserWorkspaces } from "../workspace";

// The footer's version pill and its What's new modal. Anyone signed in can
// see what changed; only a workspace admin on a self-hosted install can
// update, and only through a Dokploy instance they already manage.

export async function getReleaseStatus(): Promise<ReleaseStatus> {
  await requireWorkspace();
  return releaseStatus();
}

export type UpdateRoute =
  | { kind: "ready" }
  | { kind: "cloud" }
  | { kind: "not_admin" }
  | { kind: "no_dokploy" } // no Dokploy instance here runs this install
  | { kind: "pinned"; version: string };


async function locate(): Promise<{ route: UpdateRoute; self?: SelfCompose }> {
  if (edition() === "cloud") return { route: { kind: "cloud" } };
  const { user } = await requireWorkspace();
  const targets = await adminTargets(user.id);
  if (!targets.length) {
    const isAdmin = (await listUserWorkspaces(user.id)).some((w) => w.wsRole === "admin");
    return { route: { kind: isAdmin ? "no_dokploy" : "not_admin" } };
  }
  const self = await findSelfCompose(targets, siteHost());
  if (!self) return { route: { kind: "no_dokploy" } };
  if (self.pinned) return { route: { kind: "pinned", version: self.pinned } };
  return { route: { kind: "ready" }, self };
}

export async function getUpdateRoute(): Promise<UpdateRoute> {
  return (await locate()).route;
}

export async function startUpdate(): Promise<{ ok: true } | { ok: false; error: string }> {
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
  return { ok: true };
}
