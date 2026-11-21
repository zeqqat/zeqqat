import { notFound } from "next/navigation";
import { integrationIdsForWorkspaces } from "./integrations";
import { listUserWorkspaces, type UserWorkspace } from "./workspace";

// Which workspaces' instances an integrations page looks at. A workspace
// page sees its own; the account page sees every workspace of the account
// the viewer can open, plus integrations the account itself published.
export async function workspaceScope(ws: UserWorkspace) {
  const workspaceIds = [ws.workspaceId];
  return { workspaceIds, ids: await integrationIdsForWorkspaces(workspaceIds) };
}

export async function accountScope(userId: string, ws: { organizationId: string }) {
  const all = await listUserWorkspaces(userId);
  const workspaceIds = all.filter((w) => w.organizationId === ws.organizationId).map((w) => w.workspaceId);
  return { workspaceIds, ids: await integrationIdsForWorkspaces(workspaceIds, ws.organizationId) };
}

export function mustInclude(ids: string[], id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !ids.includes(id)) notFound();
}
