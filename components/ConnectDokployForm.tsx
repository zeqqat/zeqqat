"use client";

import { useActionState } from "react";
import { connectDokployAction, type ConnectState } from "../lib/actions/instances";
import { KeyInput, noAutofill } from "./KeyInput";

// "Test and save": the server tests the key against Dokploy first and only
// stores it if Dokploy accepted it. No sales copy beside the form: the person
// is already signed in and connecting, so the form stands alone.
export function ConnectDokployForm({ next, defaultAlias }: { next: "onboarding" | "integrations"; defaultAlias: string }) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectDokployAction, {});

  return (
    <div className="zq-split">
      <form className="a zq-panel-box" action={action} style={{ maxWidth: 640 }}>
        <input type="hidden" name="next" value={next} />
        <div className="zq-field">
          <label className="zq-label" htmlFor="alias">
            Name
          </label>
          <input
            className="zq-input"
            id="alias"
            name="alias"
            required
            maxLength={40}
            defaultValue={state.values?.alias ?? defaultAlias}
            {...noAutofill}
          />
          <p className="zq-help">How agents and your activity log refer to this Dokploy, for example production or staging.</p>
        </div>
        <div className="zq-field">
          <label className="zq-label" htmlFor="base_url">
            Dokploy URL
          </label>
          <input
            className="zq-input"
            id="base_url"
            name="base_url"
            type="url"
            required
            placeholder="https://dokploy.example.com"
            defaultValue={state.values?.baseUrl}
            {...noAutofill}
          />
          <p className="zq-help">The address you open your Dokploy dashboard at. Self-hosted or Dokploy Cloud.</p>
        </div>
        <div className="zq-field">
          <label className="zq-label" htmlFor="api_key">
            API key
          </label>
          <KeyInput id="api_key" name="api_key" required placeholder="Paste a Dokploy API key" />
          <p className="zq-help">In Dokploy, open Settings, then API Keys, and generate a key for Zeqqat.</p>
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
            {pending ? "Testing connection..." : "Test and save"}
          </button>
        </div>
      </form>
    </div>
  );
}
