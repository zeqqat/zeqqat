import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { integrationApiSpecSnapshot } from "../db/schema";
import { getServerSession } from "./session";
import { integrationIdsForWorkspaces } from "./integrations";
import { listUserWorkspaces } from "./workspace";

// The exact spec an integration's tools were built from (its newest import),
// for anyone who can see the integration in one of their workspaces or
// whose account published it.
export async function serveIntegrationSpec(id: string): Promise<Response> {
  const session = await getServerSession();
  if (!session?.user) return new Response("Not found", { status: 404 });
  const all = await listUserWorkspaces(session.user.id);
  const visible = new Set(await integrationIdsForWorkspaces(all.map((w) => w.workspaceId)));
  for (const orgId of new Set(all.filter((w) => w.orgRole === "owner").map((w) => w.organizationId))) {
    for (const i of await integrationIdsForWorkspaces([], orgId)) visible.add(i);
  }
  if (!/^[0-9a-f-]{36}$/i.test(id) || !visible.has(id)) return new Response("Not found", { status: 404 });
  const [snap] = await db
    .select({ rawSpec: integrationApiSpecSnapshot.rawSpec, release: integrationApiSpecSnapshot.release })
    .from(integrationApiSpecSnapshot)
    .where(and(eq(integrationApiSpecSnapshot.integrationId, id)))
    .orderBy(desc(integrationApiSpecSnapshot.importedAt))
    .limit(1);
  if (!snap?.rawSpec) return new Response("Not found", { status: 404 });
  return new Response(JSON.stringify(snap.rawSpec, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "private, max-age=300" },
  });
}
