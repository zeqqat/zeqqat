import { IntegrationList } from "../../../../components/IntegrationViews";
import { requireWorkspace } from "../../../../lib/guard";
import { accountScope } from "../../../../lib/integration-scope";

// Every integration this account uses or published, across the workspaces
// the viewer can open.
export default async function AccountIntegrationsPage() {
  const { user, ws } = await requireWorkspace();
  const { ids, workspaceIds } = await accountScope(user.id, ws);
  return (
    <IntegrationList
      userId={user.id}
      ids={ids}
      workspaceIds={workspaceIds}
      base="/app/org/dokploy-integrations"
      empty="No integrations yet."
      account={{ slug: ws.organizationSlug }}
    />
  );
}
