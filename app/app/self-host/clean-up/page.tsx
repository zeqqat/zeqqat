import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { instance, membership } from "../../../../db/schema";
import { removeHostedDataAction } from "../../../../lib/actions/workspace";
import { siteHost } from "../../../../lib/edition";
import { requireOwner } from "../../../../lib/guard";
import { listConnectedAgents } from "../../../../lib/permissions";

// Optional, after self-hosting: removes this workspace's Dokploy keys from
// this site and disconnects its agents. Says exactly what goes and what
// stays before anything happens.
export default async function CleanUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user, ws } = await requireOwner();
  const params = await searchParams;
  const host = siteHost();

  if (typeof params.done === "string") {
    const [keys, agents] = params.done.split("-").map((n) => Number(n) || 0);
    return (
      <div>
        <h1 className="zq-h">
          Removed from {host}
          <span className="dot">.</span>
        </h1>
        <div className="zq-ok-box" role="status" style={{ marginTop: 16 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            Deleted {keys} Dokploy {keys === 1 ? "key" : "keys"} from {host} and disconnected {agents}{" "}
            {agents === 1 ? "agent connection" : "agent connections"}. Your own Zeqqat is unchanged.
          </span>
        </div>
        <div className="zq-row-actions">
          <a className="zq-action" href="/app">
            Back to the dashboard
          </a>
        </div>
      </div>
    );
  }

  const [instances, agents, members] = await Promise.all([
    db.select({ alias: instance.alias }).from(instance).where(eq(instance.workspaceId, ws.workspaceId)),
    listConnectedAgents(ws.workspaceId),
    db.select({ userId: membership.userId }).from(membership).where(eq(membership.organizationId, ws.organizationId)),
  ]);
  const others = members.filter((m) => m.userId !== user.id).length;

  return (
    <div style={{ maxWidth: 720 }}>
      <p className="zq-kicker">
        <a href="/app/self-host">Self-host</a> / Optional clean-up
      </p>
      <h1 className="zq-h">
        Remove your Dokploy keys from {host}
        <span className="dot">?</span>
      </h1>
      <p className="zq-sub">
        For when you run your own Zeqqat now. This is optional: {host} keeps working if you skip it.
      </p>
      {params.error === "confirm" && (
        <div className="zq-warn-box" role="alert" style={{ marginTop: 16 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>Tick the box to confirm first.</span>
        </div>
      )}
      <form action={removeHostedDataAction} className="zq-confirm" style={{ marginTop: 24 }}>
        <h2 className="zq-block-t">Removed from {host}</h2>
        <ul className="zq-confirm-list">
          <li>
            <span className="ic" aria-hidden="true">
              ✕
            </span>
            <span>
              <b>API keys for {instances.length ? instances.map((i) => i.alias).join(", ") : "no instances"}</b>, deleted
              for good
            </span>
          </li>
          <li>
            <span className="ic" aria-hidden="true">
              ✕
            </span>
            <span>
              <b>{agents.length ? agents.map((a) => a.host).join(", ") : "No agents"}</b>
              {agents.length ? ` ${agents.length === 1 ? "is" : "are"} disconnected from ${host}` : " to disconnect"}
            </span>
          </li>
          {others > 0 && (
            <li>
              <span className="ic" aria-hidden="true">
                ✕
              </span>
              <span>
                <b>
                  {others} {others === 1 ? "teammate loses" : "teammates lose"}
                </b>{" "}
                access to these instances on {host}
              </span>
            </li>
          )}
          <li>
            <span className="ic" aria-hidden="true">
              ✕
            </span>
            <span>
              <b>Permissions</b> set for these instances on {host}
            </span>
          </li>
        </ul>
        <h2 className="zq-block-t" style={{ marginTop: 20 }}>
          Not touched
        </h2>
        <ul className="zq-confirm-list">
          <li>
            <span className="ic keep" aria-hidden="true">
              ✓
            </span>
            <span>
              <b>Your own Zeqqat</b> and everything you set up there
            </span>
          </li>
          <li>
            <span className="ic keep" aria-hidden="true">
              ✓
            </span>
            <span>
              <b>Your Dokploy</b>, its projects and apps. The key itself still works in Dokploy, so revoke it there if you
              want it gone everywhere
            </span>
          </li>
          <li>
            <span className="ic keep" aria-hidden="true">
              ✓
            </span>
            <span>
              <b>Your {host} account</b> and its activity history
            </span>
          </li>
        </ul>
        <label className="zq-check">
          <input type="checkbox" name="confirm" value="yes" required />
          I moved my agents to my own Zeqqat{others > 0 ? ", and my teammates know" : ""}
        </label>
        <div className="zq-row-actions">
          <a className="zq-action" href="/app">
            Keep everything
          </a>
          <button type="submit" className="zq-action zq-action-danger">
            Delete keys and disconnect agents
          </button>
        </div>
      </form>
    </div>
  );
}
