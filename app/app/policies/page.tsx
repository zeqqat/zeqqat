import { requireWorkspace } from "../../../lib/guard";
import { listPolicies, policyIntegrations } from "../../../lib/policies";
import { policyPagePath } from "../../../lib/tool-names";

const ERRORS: Record<string, string> = {
  owner_only: "Only owners of this namespace can create or copy policies.",
  integration: "Pick an integration this namespace uses.",
};

// A namespace's policies. Each is an explicit list of the tools an agent
// may run on the instances it's attached to (in Connections).
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const params = await searchParams;
  const isOwner = ws.orgRole === "owner";
  const [policies, integrations] = await Promise.all([listPolicies(ws.organizationId), policyIntegrations(ws.organizationId)]);
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  return (
    <div>
      <p className="zq-kicker">Policies</p>
      <h1 className="zq-h">
        Policies<span className="dot">.</span>
      </h1>
      <p className="zq-sub">
        A policy lists exactly which tools an agent may run. Attach one to an instance in a connection; everything not on its
        list is denied, including tools a later spec adds. Policies belong to @{ws.organizationSlug}.
      </p>
      {error && <p className="zq-form-err">{error}</p>}
      {params.deleted && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Policy deleted.</span>
        </div>
      )}

      {isOwner && integrations.length > 0 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            New policy
          </h2>
          <div className="zq-list">
            {integrations.map((i) => (
              <a className="zq-item" key={i.id} href={`/app/policies/new?integration=${i.id}`}>
                <span className="zq-item-main">
                  <span className="zq-item-t">
                    For {i.title} <span className="zq-item-s">@{i.ns}/{i.slug}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          Yours
        </h2>
        {policies.length === 0 ? (
          <p className="zq-empty">No policies yet. Connections allow tools by kind until you attach one.</p>
        ) : (
          <div className="zq-list">
            {policies.map((p) => (
              <a className="zq-item" key={p.id} href={`/app/policies/${p.id}`}>
                <span className="zq-item-main">
                  <span className="zq-item-t">
                    <code>{p.canonical}</code> <span className="zq-badge">v{p.version}</span>{" "}
                    {p.visibility === "public" && <span className="zq-badge">public</span>}
                  </span>
                  <span className="zq-item-s">
                    {p.allow.length} tools · {p.inUse ? `used on ${p.inUse} instance${p.inUse === 1 ? "" : "s"}` : "not attached"}
                    {p.description ? ` · ${p.description}` : ""}
                    {p.copiedFromName ? ` · copied from ${p.copiedFromName} v${p.copiedFromVersion}` : ""}
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
        <p className="zq-note">
          Public policies are listed on <a className="zq-textlink" href={`/${ws.organizationSlug}`}>@{ws.organizationSlug}</a>, at{" "}
          <code>{policyPagePath(ws.organizationSlug, "integration", "name")}</code>. Others copy them into their own namespace;
          your edits never change their copies.
        </p>
      </section>
    </div>
  );
}
