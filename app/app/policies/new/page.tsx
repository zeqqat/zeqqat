import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PolicyForm } from "../../../../components/PolicyForm";
import { db } from "../../../../db";
import { workspace } from "../../../../db/schema";
import { requireOrgOwner } from "../../../../lib/guard";
import { integrationTools, policyIntegrations } from "../../../../lib/policies";

const ERRORS: Record<string, string> = {
  name: "Name it with letters and numbers, for example read_plus_deploy.",
  taken: "This namespace already has a policy with that name for this integration.",
};

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireOrgOwner();
  const params = await searchParams;
  const integrationId = typeof params.integration === "string" ? params.integration : "";
  const integrations = await policyIntegrations(ws.organizationId);
  const target = integrations.find((i) => i.id === integrationId);
  if (!target) redirect("/app/policies?error=integration");
  const [tools, workspaces] = await Promise.all([
    integrationTools(target.id),
    db.select({ id: workspace.id, name: workspace.name }).from(workspace).where(eq(workspace.organizationId, ws.organizationId)),
  ]);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <div>
      <p className="zq-kicker">
        <a className="zq-textlink" href="/app/policies">
          Policies
        </a>
      </p>
      <h1 className="zq-h">
        New {target.title} policy<span className="dot">.</span>
      </h1>
      <p className="zq-sub">Tick the tools agents may run. Everything else is denied.</p>
      {error && <p className="zq-form-err">{error}</p>}
      <PolicyForm
        integrationId={target.id}
        integrationLabel={`${target.title} (@${target.ns}/${target.slug})`}
        namespace={ws.organizationSlug}
        integrationSlug={target.slug}
        name=""
        description=""
        visibility="private"
        allow={tools.filter((t) => t.kind === "read").map((t) => t.name)}
        tools={tools}
        workspaces={workspaces}
        workspaceIds={[ws.workspaceId]}
        canEdit
      />
    </div>
  );
}
