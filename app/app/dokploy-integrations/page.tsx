import { IntegrationList } from "../../../components/IntegrationViews";
import { requireWorkspace } from "../../../lib/guard";
import { workspaceScope } from "../../../lib/integration-scope";

// The integrations this workspace's Dokploy instances use. An integration is
// the list of tools that reach an instance, so it shows no instance names:
// several instances can use the same one.
export default async function WorkspaceIntegrationsPage() {
  const { user, ws } = await requireWorkspace();
  const { ids, workspaceIds } = await workspaceScope(ws);
  return (
    <IntegrationList
      userId={user.id}
      ids={ids}
      workspaceIds={workspaceIds}
      base="/app/dokploy-integrations"
      empty={`No Dokploy instance is available in ${ws.workspaceName} yet.`}
    />
  );
}
