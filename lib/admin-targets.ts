import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { instance, integration } from "../db/schema";
import { decryptCredential } from "./crypto";
import { normalizeBaseUrl } from "./dokploy-check";
import type { Target } from "./selfhost-install";
import { listUserWorkspaces } from "./workspace";

// The Dokploy instances (with their decrypted keys) in every workspace this
// person administers: how a self-hosted install reaches the Dokploy that
// runs it, for updates and for turning on HTTPS. Not in a "use server"
// file on purpose: it returns keys and must never be callable from a page.
export async function adminTargets(userId: string): Promise<Target[]> {
  const admin = (await listUserWorkspaces(userId)).filter((w) => w.wsRole === "admin").map((w) => w.workspaceId);
  if (!admin.length) return [];
  const rows = await db
    .select({ baseUrl: instance.baseUrl, credential: instance.credential })
    .from(instance)
    .innerJoin(integration, eq(integration.id, instance.integrationId))
    .where(and(inArray(instance.workspaceId, admin), eq(integration.slug, "dokploy")));
  const out: Target[] = [];
  for (const r of rows) {
    const baseUrl = normalizeBaseUrl(r.baseUrl);
    if (!baseUrl) continue;
    try {
      out.push({ baseUrl, apiKey: decryptCredential(r.credential) });
    } catch {
      // A key that no longer decrypts can't be the way in; skip it.
    }
  }
  return out;
}
