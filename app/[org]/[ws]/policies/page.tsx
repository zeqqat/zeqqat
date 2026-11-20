import { PolicyList } from "../../../../components/PolicyViews";
import { hrefIn, requireWorkspace } from "../../../../lib/guard";
import { policyCards } from "../../../../lib/policy-pages";

// The policies this workspace's MCP URLs use, with their usage here. Each
// opens in the workspace; new ones are made on the account's Policies page.
export default async function WorkspacePoliciesPage() {
  const { ws } = await requireWorkspace();
  const cards = await policyCards(ws.organizationId, [ws.workspaceId], true);
  return <PolicyList cards={cards} count={cards.length} base={hrefIn(ws, "/policies")} newHref={null} />;
}
