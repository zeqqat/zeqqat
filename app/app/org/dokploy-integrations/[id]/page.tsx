import { IntegrationDetail } from "../../../../../components/IntegrationViews";
import { requireWorkspace } from "../../../../../lib/guard";
import { accountScope, mustInclude } from "../../../../../lib/integration-scope";

export default async function AccountIntegrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, ws } = await requireWorkspace();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { ids, workspaceIds } = await accountScope(user.id, ws);
  mustInclude(ids, id);
  return <IntegrationDetail userId={user.id} integrationId={id} workspaceIds={workspaceIds} base="/app/org/dokploy-integrations" params={sp} />;
}
