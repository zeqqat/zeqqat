"use client";

import { useActionState, useState } from "react";
import { createWorkspaceAction, setupWorkspaceAction, type FormState } from "../lib/actions/workspace";
import { isReservedWorkspaceSlug } from "../lib/paths";
import { InfoBubble } from "./activity/InfoBubble";
import { IntegrationMark } from "./Marks";

export type InstanceChoice = { id: string; alias: string; host: string; appSlug: string; appName: string; appLogo: string | null };

function slugOf(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Naming a workspace: in Setup (step 2) and in "New workspace". The name,
// then the account's instances it can use. A name the account already
// uses is fine: an info box says it makes a second one, and at which
// address.
export function WorkspaceForm({
  mode,
  account,
  instances,
  existing,
  checked,
}: {
  mode: "setup" | "new";
  account: string;
  instances: InstanceChoice[];
  existing: string[]; // the account's workspace slugs
  checked: string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "setup" ? setupWorkspaceAction : createWorkspaceAction, {});
  const [name, setName] = useState("");
  const base = slugOf(name);
  let next: string | null = null;
  if (base && !isReservedWorkspaceSlug(base) && existing.includes(base)) {
    let k = 2;
    while (existing.includes(`${base}-${k}`)) k++;
    next = `${base}-${k}`;
  }
  return (
    <form action={action} className={mode === "setup" ? "zq-panel-box zq-connect-form" : undefined}>
      <div className="zq-field">
        <div className="zq-label-row">
          <label className="zq-label" htmlFor="ws_name">
            Workspace name
          </label>
          {mode === "setup" && (
            <InfoBubble title="Workspace" inline>
              A workspace holds your MCP URLs and the people who use them. It can only reach the Dokploy instances you give it.
            </InfoBubble>
          )}
        </div>
        <input
          className="zq-input"
          id="ws_name"
          name="name"
          required
          placeholder="production"
          maxLength={60}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {instances.length > 0 && (
        <div className="zq-field">
          <span className="zq-label">Dokploy instances it can use</span>
          <div className="zq-ipick-list">
            {instances.map((i) => (
              <label key={i.id} className="zq-ipick">
                <input type="checkbox" name="instance_id" value={i.id} defaultChecked={checked.includes(i.id)} />
                <IntegrationMark slug={i.appSlug} name={i.appName} logo={i.appLogo} size={16} />
                <span className="t">
                  <b>{i.alias}</b>
                  <small>{i.host}</small>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
      {next && (
        <div className="zq-info-box" role="status" style={{ marginBottom: 14 }}>
          <span className="ic" aria-hidden="true">
            i
          </span>
          <span>
            You already have a workspace called {base}. Creating this one makes a second workspace with the same name, at @{account}/{next}.
          </span>
        </div>
      )}
      {state.error && (
        <div className="zq-warn-box" role="alert">
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{state.error}</span>
        </div>
      )}
      <div className="zq-row-actions" style={{ marginTop: 4 }}>
        <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={mode === "new" ? { width: "100%" } : undefined}>
          {pending ? "Creating..." : "Create workspace"}
        </button>
      </div>
    </form>
  );
}
