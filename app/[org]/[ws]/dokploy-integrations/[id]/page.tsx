import { IntegrationDetail } from "../../../../../components/IntegrationViews";
import { here, requireWorkspace } from "../../../../../lib/guard";
import { mustInclude, workspaceScope } from "../../../../../lib/integration-scope";

export default async function WorkspaceIntegrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const base = await here();
  const { user, ws } = await requireWorkspace();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ids, workspaceIds } = await workspaceScope(ws);
  mustInclude(ids, id);
  return <IntegrationDetail userId={user.id} integrationId={id} workspaceIds={workspaceIds} base={`${base}/dokploy-integrations`} params={sp} />;
}
