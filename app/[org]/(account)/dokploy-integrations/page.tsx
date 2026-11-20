import { IntegrationList } from "../../../../components/IntegrationViews";
import { hereAccount, requireWorkspace } from "../../../../lib/guard";
import { accountScope } from "../../../../lib/integration-scope";

// Every integration this account uses or published, across the workspaces
// the viewer can open.
export default async function AccountIntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acct = await hereAccount();
  const { user, ws } = await requireWorkspace();
  const what = (await searchParams).what === "1";
  const { ids, workspaceIds } = await accountScope(user.id, ws);
  return (
    <IntegrationList
      what={what}
      userId={user.id}
      ids={ids}
      workspaceIds={workspaceIds}
      base={`${acct}/dokploy-integrations`}
      empty="No integrations yet."
      account={{ slug: ws.organizationSlug }}
    />
  );
}
