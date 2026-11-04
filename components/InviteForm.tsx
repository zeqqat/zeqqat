"use client";

import { useActionState } from "react";
import { createInviteAction, type InviteState } from "../lib/actions/team";
import { CopyButton } from "./CopyButton";

// Zeqqat doesn't send email, so the owner gets the invite link to pass on.
// It's shown once, right here; only its hash is kept.
export function InviteForm({ canMakeOrgOwner = false, workspace }: { canMakeOrgOwner?: boolean; workspace: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInviteAction, {});

  return (
    <div>
      <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 14 }}>
        <div style={{ flex: "999 1 260px" }}>
          <label className="zq-label" htmlFor="invite_email">
            Google account email
          </label>
          <input className="zq-input" id="invite_email" name="email" type="email" required placeholder="teammate@example.com" />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label className="zq-label" htmlFor="invite_role">
            Role
          </label>
          <select className="zq-select" id="invite_role" name="ws_role" defaultValue="member">
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" className="zq-action zq-action-primary" disabled={pending} style={{ flex: "1 1 140px" }}>
          {pending ? "Creating..." : "Create invite link"}
        </button>
        {canMakeOrgOwner && (
          <label className="zq-help" style={{ flex: "1 1 100%", display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
            <input type="checkbox" name="org_owner" />
            Make them an org owner too (admin of every workspace)
          </label>
        )}
      </form>
      <p className="zq-help">
        They join {workspace} with that role. The link only works for that Google account, and expires in 7 days.
      </p>
      {state.error && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 12 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>{state.error}</span>
        </div>
      )}
      {state.link && (
        <div style={{ marginTop: 14 }}>
          <div className="zq-ok-box" role="status">
            <span className="ic" aria-hidden="true">
              ✓
            </span>
            <span>
              Invite created for <b>{state.email}</b>. Send them this link. It is shown only once.
            </span>
          </div>
          <div className="zq-cbox">
            <div className="zq-cbox-row">
              <code>{state.link}</code>
              <CopyButton text={state.link} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
