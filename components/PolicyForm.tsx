import { savePolicyFormAction } from "../lib/actions/policies";
import { PolicyToolPicker } from "./PolicyToolPicker";

type Props = {
  policyId?: string;
  integrationId: string;
  integrationLabel: string;
  namespace: string;
  integrationSlug: string;
  name: string;
  description: string;
  visibility: string;
  allow: string[];
  tools: { name: string; kind: string; summary: string | null }[];
  workspaces: { id: string; name: string }[];
  workspaceIds: string[];
  canEdit: boolean;
};

// Create and edit share this form. The canonical name is shown as you type
// it would be: @namespace/integration.policy.name.
export function PolicyForm(p: Props) {
  return (
    <form action={savePolicyFormAction}>
      {p.policyId && <input type="hidden" name="policy_id" value={p.policyId} />}
      <input type="hidden" name="integration_id" value={p.integrationId} />

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          Policy
        </h2>
        <dl className="zq-kv">
          <dt>Integration</dt>
          <dd>{p.integrationLabel}</dd>
          <dt>Name</dt>
          <dd>
            <span className="zq-item-s">
              @{p.namespace}/{p.integrationSlug}.policy.
            </span>
            <input
              className="zq-input"
              name="name"
              defaultValue={p.name}
              required
              placeholder="read_plus_deploy"
              disabled={!p.canEdit}
              style={{ width: "auto", minWidth: 220 }}
            />
          </dd>
          <dt>Description</dt>
          <dd>
            <input
              className="zq-input"
              name="description"
              defaultValue={p.description}
              maxLength={280}
              placeholder="Read apps and logs, deploy and stop apps."
              disabled={!p.canEdit}
            />
          </dd>
          <dt>Visibility</dt>
          <dd>
            <select className="zq-select" name="visibility" defaultValue={p.visibility} disabled={!p.canEdit} style={{ width: "auto" }}>
              <option value="private">Private: only this namespace</option>
              <option value="public">Public: listed on @{p.namespace}, anyone can copy it</option>
            </select>
          </dd>
        </dl>
        <p className="zq-note">The description is what agents see for each instance this policy is attached to.</p>
      </section>

      {p.workspaces.length > 1 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Workspaces that can use it
          </h2>
          <div className="zq-list">
            {p.workspaces.map((w) => (
              <label className="zq-item" key={w.id}>
                <input type="checkbox" name="workspace" value={w.id} defaultChecked={p.workspaceIds.includes(w.id)} disabled={!p.canEdit} />
                <span className="zq-item-main">
                  <span className="zq-item-t">{w.name}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}
      {p.workspaces.length === 1 && <input type="hidden" name="workspace" value={p.workspaces[0].id} />}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          Allowed tools
        </h2>
        {p.tools.length === 0 ? (
          <p className="zq-empty">This integration has no tools yet.</p>
        ) : (
          <PolicyToolPicker tools={p.tools} selected={p.allow} disabled={!p.canEdit} />
        )}
      </section>

      {p.canEdit && (
        <button type="submit" className="zq-action zq-action-primary" style={{ marginTop: 14 }}>
          {p.policyId ? "Save as a new version" : "Create policy"}
        </button>
      )}
    </form>
  );
}
