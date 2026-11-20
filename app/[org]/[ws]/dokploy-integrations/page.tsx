import { IntegrationList } from "../../../../components/IntegrationViews";
import { here, requireWorkspace } from "../../../../lib/guard";
import { workspaceScope } from "../../../../lib/integration-scope";

// The integrations this workspace's Dokploy instances use. An integration is
// the list of tools that reach an instance, so it shows no instance names:
// several instances can use the same one.
export default async function WorkspaceIntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const base = await here();
  const { user, ws } = await requireWorkspace();
  const what = (await searchParams).what === "1";
  const { ids, workspaceIds } = await workspaceScope(ws);
  return (
    <IntegrationList
      what={what}
      userId={user.id}
      ids={ids}
      workspaceIds={workspaceIds}
      base={`${base}/dokploy-integrations`}
      empty={`No Dokploy instance is available in ${ws.workspaceName} yet.`}
    />
  );
}
