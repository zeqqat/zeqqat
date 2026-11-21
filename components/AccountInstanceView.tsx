"use client";

import { useState } from "react";
import { removeInstanceAction, setInstanceWorkspaceAction } from "../lib/actions/instances";
import { InstanceCardView, type InstanceCard } from "./InstanceCards";
import { ManageRow } from "./McpUrlPage";
import type { Period } from "./McpUrls";

type Ws = { id: string; name: string; on: boolean; urls: number };

// An instance at the account level (app/[org]/(account)/dokploy-instances/
// [id]): the list's card, then Workspaces (which of the account's
// workspaces may use it, one toggle each) and Manage.
export function AccountInstanceView({
  card,
  tab: initialTab,
  canEdit,
  error,
  workspaces,
}: {
  card: InstanceCard;
  tab: "workspaces" | "manage";
  canEdit: boolean;
  error: string | null;
  workspaces: Ws[];
}) {
  const [period, setPeriod] = useState<Period>("week");
  const [tab, setTab] = useState(initialTab);
  const tabs: [typeof tab, string][] = [
    ["workspaces", "Workspaces"],
    ["manage", "Manage"],
  ];
  return (
    <div className="zq-mu-page">
      <div className="zq-di-list zq-ip-one">
        <InstanceCardView c={card} period={period} onPeriod={setPeriod} linked={false} />
      </div>
      <div className="zq-mu-detail">
        <nav className="zq-mu-tabs" aria-label="Instance">
          {tabs.map(([t, label]) => (
            <a
              key={t}
              href={`?tab=${t}`}
              className={`zq-mu-tab${tab === t ? " is-on" : ""}`}
              aria-current={tab === t ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                setTab(t);
                window.history.replaceState(null, "", `?tab=${t}`);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        {tab === "workspaces" ? (
          <div className="zq-mu-panel">
            {workspaces.map((w) => (
              <form key={w.id} action={setInstanceWorkspaceAction} className="zq-mu-mrow">
                <input type="hidden" name="instance_id" value={card.id} />
                <input type="hidden" name="workspace_id" value={w.id} />
                <input type="hidden" name="on" value={w.on ? "off" : "on"} />
                <div className="zq-mu-mrow-h">
                  <span className="zq-acc-ws" aria-hidden="true">
                    {w.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="zq-mu-mrow-t">
                    <b>{w.name}</b>
                    <small>{w.on ? (w.urls ? `${w.urls} MCP URL${w.urls === 1 ? "" : "s"} in it` : "No MCP URL in it yet") : "Can’t use it"}</small>
                  </span>
                  <button
                    type="submit"
                    className="zq-toggle"
                    aria-pressed={w.on}
                    aria-label={`${w.name} can use ${card.name}`}
                    disabled={!canEdit}
                    title={canEdit ? undefined : "Only the account’s owners decide this"}
                  />
                </div>
              </form>
            ))}
          </div>
        ) : (
          <div className="zq-mu-panel">
            <div className="zq-mu-mrow">
              <div className="zq-mu-mrow-h">
                <span className="zq-mu-mrow-t">
                  <b>{card.appName} URL</b>
                  <small>{card.host}</small>
                </span>
              </div>
            </div>
            {canEdit && (
              <ManageRow
                title="Remove"
                value="Deletes the key from Zeqqat. Every workspace and MCP URL stops reaching it. Past calls stay in Activity"
                button="Remove"
                submit={`Remove ${card.name}`}
                formId="ai-remove"
                danger
                open={error === "confirm"}
              >
                <form action={removeInstanceAction} id="ai-remove">
                  <input type="hidden" name="instance_id" value={card.id} />
                  <input type="hidden" name="base" value="account" />
                  <input className="zq-input" name="confirm" placeholder={`Type ${card.name} to confirm`} autoComplete="off" aria-label={`Type ${card.name} to confirm`} />
                  {error === "confirm" && <p className="zq-form-err">Type {card.name} to confirm.</p>}
                </form>
              </ManageRow>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
