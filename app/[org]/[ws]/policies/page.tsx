import { PolicyList } from "../../../../components/PolicyViews";
import { accountHref, requireWorkspace } from "../../../../lib/guard";
import { policyCards } from "../../../../lib/policy-pages";

// The policies this workspace's MCP URLs use, with their usage here. They
// belong to the account, so each opens the account's policy page and new
// ones are made there.
export default async function WorkspacePoliciesPage() {
  const { ws } = await requireWorkspace();
  const cards = await policyCards(ws.organizationId, [ws.workspaceId], true);
  return <PolicyList cards={cards} count={cards.length} base={accountHref(ws, "/policies")} newHref={null} />;
}
