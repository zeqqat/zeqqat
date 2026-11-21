import { redirect } from "next/navigation";
import { CrumbLast } from "../../../../../components/AppShell";
import { PolicyTools } from "../../../../../components/PolicyClient";
import { Shield } from "../../../../../components/PolicyViews";
import { savePolicyFormAction } from "../../../../../lib/actions/policies";
import { hereAccount, requireAccount } from "../../../../../lib/guard";
import { accountScope } from "../../../../../lib/integration-scope";
import { listPolicies, policyIntegrations } from "../../../../../lib/policies";
import { policyTools } from "../../../../../lib/policy-pages";

const ERRORS: Record<string, string> = {
  name: "Name it with letters and numbers, for example read_plus_deploy.",
  taken: "You already have a policy with that name for this integration.",
};

// A new policy for the account's Dokploy integration: a name, what agents
// read, then the MCP tools it allows. Starting from an existing policy is
// the quick way to make a variation.
export default async function NewPolicyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const acct = await hereAccount();
  const { user, acct: ws } = await requireAccount();
  if (ws.orgRole !== "owner") redirect(`${acct}/policies`);
  const query = await searchParams;
  const integrations = await policyIntegrations(ws.organizationId);
  const pickedId = typeof query.integration === "string" ? query.integration : "";
  const integ = integrations.find((i) => i.id === pickedId) ?? integrations.find((i) => i.slug === "dokploy") ?? integrations[0];
  if (!integ) redirect(`${acct}/policies`);
  const [tools, policies, { workspaceIds }] = await Promise.all([
    policyTools(integ.id, [], null),
    listPolicies(ws.organizationId),
    accountScope(user.id, ws),
  ]);
  const presets = [
    { label: "Nothing", allow: [] as string[] },
    { label: "All read", allow: tools.filter((t) => t.kind === "read").map((t) => t.name) },
    ...policies.filter((p) => p.integrationId === integ.id).map((p) => ({ label: p.name, allow: p.allow })),
  ];
  const error = typeof query.error === "string" ? ERRORS[query.error] : undefined;

  return (
    <form action={savePolicyFormAction} className="zq-in-card zq-pl-page zq-pl-form">
      <CrumbLast text="New policy" />
      <input type="hidden" name="integration_id" value={integ.id} />
      <input type="hidden" name="visibility" value="private" />
      {workspaceIds.map((w) => (
        <input key={w} type="hidden" name="workspace" value={w} />
      ))}
      <div className="zq-pl-row is-head">
        <span className="zq-pl-ic">
          <Shield />
        </span>
        <span className="zq-pl-x">
          <span className="zq-pl-l1 zq-pl-namein">
            <span className="zq-pl-pre">@{ws.organizationSlug}/{integ.slug}.policy.</span>
            <input className="zq-input" name="name" required maxLength={64} placeholder="read_plus_deploy" aria-label="Policy name" autoFocus />
          </span>
          <input
            className="zq-input zq-pl-descin"
            name="description"
            maxLength={280}
            placeholder="What agents read, e.g. Read apps and logs, deploy and stop apps."
            aria-label="What agents read"
          />
        </span>
      </div>
      {error && <p className="zq-form-err zq-pl-err">{error}</p>}
      <nav className="zq-mu-tabs zq-in-tabs" aria-label="New policy">
        <span className="zq-mu-tab is-on">MCP tools</span>
      </nav>
      <PolicyTools tools={tools} allow={[]} editable start="all" version={null} urls={0} presets={presets} />
    </form>
  );
}
