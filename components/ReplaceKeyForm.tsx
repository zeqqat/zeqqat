"use client";

import { useActionState, useState } from "react";
import { replaceKeyAction, type ConnectState } from "../lib/actions/instances";
import { KeyInput } from "./KeyInput";

// Replacing a key runs the same connection test as connecting: the new key
// is only stored if Dokploy accepts it.
export function ReplaceKeyForm({ instanceId }: { instanceId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ConnectState, FormData>(replaceKeyAction, {});

  if (!open) {
    return (
      <button type="button" className="zq-action zq-action-sm" onClick={() => setOpen(true)}>
        Replace key
      </button>
    );
  }

  return (
    <form action={action} style={{ width: "100%", marginTop: 10 }}>
      <input type="hidden" name="instance_id" value={instanceId} />
      <label className="zq-label" htmlFor="new_key">
        New API key
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <KeyInput id="new_key" name="api_key" required style={{ flex: "999 1 240px" }} />
        <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={{ flex: "1 1 auto" }}>
          {pending ? "Testing..." : "Test and replace"}
        </button>
        <button type="button" className="zq-action" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{state.error}</span>
        </div>
      )}
    </form>
  );
}
