import { PolicyList } from "../../../../components/PolicyViews";
import { hereAccount, requireAccount } from "../../../../lib/guard";
import { accountScope } from "../../../../lib/integration-scope";
import { policyCards } from "../../../../lib/policy-pages";

// Every policy the account owns, used or not, with usage across all its
// workspaces. Policies are made and edited here; workspaces only use them.
export default async function AccountPoliciesPage() {
  const acct = await hereAccount();
  const { user, acct: ws } = await requireAccount();
  const { workspaceIds } = await accountScope(user.id, ws);
  const cards = await policyCards(ws.organizationId, workspaceIds, false);
  return (
    <PolicyList
      cards={cards}
      count={cards.length}
      base={`${acct}/policies`}
      newHref={ws.orgRole === "owner" ? `${acct}/policies/new` : null}
    />
  );
}
