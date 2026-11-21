"use client";

import { useActionState, useEffect, useState } from "react";
import { createInviteAction, inviteUrlChoicesAction, type InviteState } from "../lib/actions/team";
import { CopyButton } from "./CopyButton";

// Zeqqat doesn't send email, so the owner gets the invite link to pass on.
// It's shown once, right here; only its hash is kept.
// `workspaces` (the account's Members page): the inviter picks which
// workspace they join. Without it, they join the current one.
export function InviteForm({
  canMakeOrgOwner = false,
  workspaces,
}: {
  canMakeOrgOwner?: boolean;
  workspace: string;
  workspaces?: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<InviteState, FormData>(createInviteAction, {});
  const [wsId, setWsId] = useState<string | null>(workspaces?.[0]?.id ?? null);
  const [urls, setUrls] = useState<{ id: string; name: string; shortId: string; policy: string }[]>([]);
  const [urlId, setUrlId] = useState("");
  // The MCP URLs of the chosen workspace: the invite hands out one of them.
  useEffect(() => {
    let live = true;
    inviteUrlChoicesAction(wsId).then((u) => {
      if (!live) return;
      setUrls(u);
      setUrlId(u[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, [wsId]);
  const picked = urls.find((u) => u.id === urlId);

  return (
    <div>
      <form action={action} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginTop: 14 }}>
        <div style={{ flex: "999 1 260px" }}>
          <label className="zq-label" htmlFor="invite_email">
            Email
          </label>
          <input className="zq-input" id="invite_email" name="email" type="email" required placeholder="teammate@example.com" />
        </div>
        {workspaces && (
          <div style={{ flex: "1 1 160px" }}>
            <label className="zq-label" htmlFor="invite_ws">
              Workspace
            </label>
            <select className="zq-select" id="invite_ws" name="workspace_id" defaultValue={workspaces[0]?.id} onChange={(e) => setWsId(e.target.value)}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        )}
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
        {urls.length > 0 && (
          <div style={{ flex: "1 1 100%" }}>
            <label className="zq-label" htmlFor="invite_url">
              MCP URL
            </label>
            <select className="zq-select" id="invite_url" name="connection_id" value={urlId} onChange={(e) => setUrlId(e.target.value)}>
              {urls.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.shortId}
                </option>
              ))}
            </select>
            {picked && (
              <p className="zq-help" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <svg className="zq-pl-shield" viewBox="0 0 24 24" width={13} height={13} aria-hidden="true">
                  <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" />
                  <path d="M8.5 12l2.5 2.5 4.5-5" />
                </svg>
                {picked.policy}
              </p>
            )}
          </div>
        )}
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
        The link only works for that email, and expires in 7 days.
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
