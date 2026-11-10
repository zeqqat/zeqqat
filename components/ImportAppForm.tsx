"use client";

import { useActionState } from "react";
import { importAppAction, type ImportState } from "../lib/actions/imports";

// Add any app from its OpenAPI spec. The spec link is all Zeqqat needs;
// the docs link is kept for people (and agents) who want more context.
export function ImportAppForm({
  account,
  prefill,
}: {
  account: string;
  // A link can fill the form in (?add=app&spec=...).
  prefill?: { specUrl?: string; docsUrl?: string; name?: string };
}) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAppAction, {});
  return (
    <form className="zq-panel-box" action={action} style={{ maxWidth: 640 }}>
      <div className="zq-field">
        <label className="zq-label" htmlFor="spec_url">
          OpenAPI spec link
        </label>
        <input
          className="zq-input"
          id="spec_url"
          name="spec_url"
          type="url"
          required
          placeholder="https://example.com/openapi.json"
          defaultValue={state.values?.specUrl ?? prefill?.specUrl}
        />
        <p className="zq-help">The raw OpenAPI 3 file, JSON or YAML. Most apps link it from their API docs.</p>
      </div>
      <div className="zq-field">
        <label className="zq-label" htmlFor="docs_url">
          Docs link <span className="zq-item-s">(optional)</span>
        </label>
        <input
          className="zq-input"
          id="docs_url"
          name="docs_url"
          type="url"
          placeholder="https://example.com/docs/api"
          defaultValue={state.values?.docsUrl ?? prefill?.docsUrl}
        />
      </div>
      <div className="zq-field">
        <label className="zq-label" htmlFor="name">
          Name <span className="zq-item-s">(optional)</span>
        </label>
        <input className="zq-input" id="name" name="name" maxLength={80} placeholder="Defaults to the spec's title" defaultValue={state.values?.name ?? prefill?.name} />
        <p className="zq-help">
          The app is added as @{account}/&lt;name&gt;. Adding the same link again updates it.
        </p>
      </div>
      {state.error && (
        <div className="zq-warn-box" role="alert">
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{state.error}</span>
        </div>
      )}
      <div className="zq-row-actions" style={{ marginTop: 4 }}>
        <button type="submit" className="zq-action zq-action-primary" disabled={pending}>
          {pending ? "Reading the spec..." : "Add app"}
        </button>
      </div>
    </form>
  );
}
