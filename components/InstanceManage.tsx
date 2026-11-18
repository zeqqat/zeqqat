"use client";

import { useActionState, useState } from "react";
import { replaceKeyAction, type ConnectState } from "../lib/actions/instances";
import { KeyInput } from "./KeyInput";

// The API key row on an instance's Manage tab. Replacing a key runs the same
// connection test as connecting: the new key is only stored if Dokploy
// accepts it.
export function KeyRow({ instanceId, canEdit }: { instanceId: string; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ConnectState, FormData>(replaceKeyAction, {});
  return (
    <div className="zq-mu-mrow">
      <div className="zq-mu-mrow-h">
        <span className="zq-mu-mrow-t">
          <b>API key</b>
          <small>Saved and encrypted. It can&rsquo;t be shown again</small>
        </span>
        {canEdit && (
          <button type="button" className="zq-action zq-action-sm zq-mu-mbtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Replace
          </button>
        )}
      </div>
      {open && (
        <form action={action} className="zq-mu-mform">
          <input type="hidden" name="instance_id" value={instanceId} />
          <KeyInput name="api_key" required aria-label="New API key" placeholder="New Dokploy API key" />
          {state.error && <p className="zq-form-err">{state.error}</p>}
          <div className="zq-mu-mform-b">
            <button type="submit" className="zq-action zq-action-sm zq-action-primary" disabled={pending}>
              {pending ? "Testing..." : "Test and save"}
            </button>
            <button type="button" className="zq-action zq-action-sm" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
