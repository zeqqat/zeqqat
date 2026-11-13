"use server";

import { adminTargets } from "../admin-targets";
import { edition, siteHost } from "../edition";
import { requireWorkspace } from "../guard";
import { findSelfCompose } from "../self-update";
import { canGetCertificate, turnOnHttps } from "../self-https";
import { InstallError } from "../selfhost-install";

// The "Turn on HTTPS" banner's button. Self-hosted only, and only for a
// workspace admin whose Dokploy runs this install.
export async function enableHttps(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (edition() === "cloud") return { ok: false, error: "zeqqat.com is already on HTTPS." };
  const { user } = await requireWorkspace();
  const host = siteHost();
  if (!canGetCertificate(host)) {
    return { ok: false, error: "This address can't get a certificate. Add your own domain to Zeqqat in Dokploy, with HTTPS on." };
  }
  const targets = await adminTargets(user.id);
  if (!targets.length) return { ok: false, error: "Only an admin with this Zeqqat's Dokploy connected can turn on HTTPS." };
  try {
    const self = await findSelfCompose(targets, host);
    if (!self) {
      return { ok: false, error: "None of your connected Dokploys runs this Zeqqat. Turn on HTTPS for its domain in Dokploy instead." };
    }
    return { ok: true, ...(await turnOnHttps(self, host)) };
  } catch (err) {
    if (err instanceof InstallError) return { ok: false, error: err.message };
    throw err;
  }
}
