"use client";

import { useActionState, useState } from "react";
import { createConnectionAction, type ConnFormState } from "../lib/actions/connections";
import { createOrgAction, createWorkspaceAction, type FormState } from "../lib/actions/workspace";

function ErrorBox({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <div className="zq-warn-box" role="alert" style={{ marginTop: 12 }}>
      <span className="ic" aria-hidden="true">
        !
      </span>
      <span>{error}</span>
    </div>
  );
}

export function CreateConnectionForm({ orgSlug }: { orgSlug: string }) {
  const [state, action, pending] = useActionState<ConnFormState, FormData>(createConnectionAction, {});
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"members" | "public">("members");
  const preview = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (
    <form action={action}>
      <div className="zq-field">
        <label className="zq-label" htmlFor="conn_name">
          Name
        </label>
        <input
          className="zq-input"
          id="conn_name"
          name="name"
          required
          placeholder="deployment"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <p className="zq-help">
          What it&rsquo;s for, e.g. deployment or social. Part of the URL, so it can&rsquo;t change later: /{orgSlug}/mcp/
          {preview || "name"}/&hellip; Names don&rsquo;t need to be unique.
        </p>
      </div>
      <div className="zq-field">
        <label className="zq-label" htmlFor="conn_desc">
          What it&rsquo;s for (optional)
        </label>
        <input className="zq-input" id="conn_desc" name="description" placeholder="Engineering agents that deploy" maxLength={140} />
      </div>
      <fieldset className="zq-field" style={{ border: 0, padding: 0, margin: "16px 0 0" }}>
        <legend className="zq-label">Who can use it</legend>
        <div className="zq-radios">
          <label className="zq-radio">
            <input type="radio" name="auth_mode" value="members" checked={mode === "members"} onChange={() => setMode("members")} />
            <span>
              <b>Workspace members</b>
              <small>Agents sign in. Each person&rsquo;s role narrows what the connection allows.</small>
            </span>
          </label>
          <label className="zq-radio">
            <input type="radio" name="auth_mode" value="public" checked={mode === "public"} onChange={() => setMode("public")} />
            <span>
              <b>Anyone with the URL</b>
              <small>No sign-in. Read only, rate limited, and runs on this workspace&rsquo;s keys.</small>
            </span>
          </label>
        </div>
      </fieldset>
      <ErrorBox error={state.error} />
      <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={{ marginTop: 16 }}>
        {pending ? "Creating..." : "Create connection"}
      </button>
    </form>
  );
}

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createWorkspaceAction, {});
  return (
    <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
      <div style={{ flex: "999 1 240px" }}>
        <label className="zq-label" htmlFor="ws_name">
          Workspace name
        </label>
        <input className="zq-input" id="ws_name" name="name" required placeholder="Marketing" maxLength={60} />
      </div>
      <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={{ flex: "1 1 160px" }}>
        {pending ? "Creating..." : "Create workspace"}
      </button>
      <div style={{ flex: "1 1 100%" }}>
        <ErrorBox error={state.error} />
      </div>
    </form>
  );
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrgAction, {});
  return (
    <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
      <div style={{ flex: "999 1 200px" }}>
        <label className="zq-label" htmlFor="org_name">
          Organization name
        </label>
        <input className="zq-input" id="org_name" name="name" required placeholder="Acme Corp" maxLength={60} />
      </div>
      <div style={{ flex: "999 1 160px" }}>
        <label className="zq-label" htmlFor="org_slug">
          Username
        </label>
        <input className="zq-input" id="org_slug" name="slug" placeholder="acme_corp" maxLength={39} />
      </div>
      <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={{ flex: "1 1 140px" }}>
        {pending ? "Creating..." : "Create organization"}
      </button>
      <div style={{ flex: "1 1 100%" }}>
        <ErrorBox error={state.error} />
      </div>
    </form>
  );
}
