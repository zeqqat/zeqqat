"use client";

import { useActionState } from "react";
import { connectAppAction, type ConnectState } from "../lib/actions/instances";
import { KeyInput, noAutofill } from "./KeyInput";

// An instance of an imported app: where it lives and the key Zeqqat sends.
export function ConnectAppForm({
  integrationId,
  appName,
  defaultBaseUrl,
}: {
  integrationId: string;
  appName: string;
  defaultBaseUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ConnectState, FormData>(connectAppAction, {});
  return (
    <form className="zq-panel-box" action={action} style={{ maxWidth: 640 }}>
      <input type="hidden" name="integration_id" value={integrationId} />
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
          defaultValue={state.values?.alias ?? "production"}
          {...noAutofill}
        />
        <p className="zq-help">How agents and your activity log refer to this {appName}, for example production.</p>
      </div>
      <div className="zq-field">
        <label className="zq-label" htmlFor="base_url">
          API URL
        </label>
        <input
          className="zq-input"
          id="base_url"
          name="base_url"
          type="url"
          required
          placeholder="https://api.example.com"
          defaultValue={state.values?.baseUrl ?? defaultBaseUrl ?? ""}
          {...noAutofill}
        />
        <p className="zq-help">Where the API answers. Filled in from the spec when it says.</p>
      </div>
      <div className="zq-field">
        <label className="zq-label" htmlFor="api_key">
          API key or token
        </label>
        <KeyInput id="api_key" name="api_key" placeholder="Paste an API key or token" />
        <p className="zq-help">
          Sent the way the spec says (a header, a Bearer token or Basic auth). Encrypted, never shown again. Leave it
          empty for an API that needs no key.
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
          {pending ? "Checking..." : "Save"}
        </button>
      </div>
    </form>
  );
}
