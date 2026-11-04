import { and, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CopyButton } from "../../../../components/CopyButton";
import { db } from "../../../../db";
import { oauthClient, oauthGrant, user } from "../../../../db/schema";
import {
  deleteConnectionAction,
  replaceConnectionAction,
  reviveConnectionAction,
  savePolicyAction,
  setAuthModeAction,
  sunsetConnectionAction,
} from "../../../../lib/actions/connections";
import {
  connectionTokenHolders,
  formatCutoff,
  getConnection,
  getConnectionById,
  getConnectionPolicy,
  ROLE_CAP,
  sunsetNotice,
  type Kind,
} from "../../../../lib/connections";
import { requireWorkspace } from "../../../../lib/guard";
import { agentHost } from "../../../../lib/permissions";
import { pickablePolicies, type PolicySummary } from "../../../../lib/policies";

const KINDS: { k: Kind; label: string }[] = [
  { k: "read", label: "Read" },
  { k: "create", label: "Create" },
  { k: "edit", label: "Edit" },
  { k: "delete", label: "Delete" },
];

// Defaults for the sunset date inputs. Outside the component: a server
// component renders once per request, so reading the clock here is fine.
function dateDefaults() {
  const now = new Date();
  const week = new Date(now.getTime() + 7 * 86_400_000);
  return { today: now.toISOString().slice(0, 10), inAWeek: week.toISOString().slice(0, 10) };
}

export default async function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ws } = await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;
  const conn = await getConnection(ws.workspaceId, id);
  if (!conn) notFound();
  const isAdmin = ws.wsRole === "admin";
  const isPublic = conn.authMode === "public";
  const notice = await sunsetNotice(conn);
  const [replacedBy, replaces, holders] = await Promise.all([
    conn.replacedByConnectionId ? getConnectionById(conn.replacedByConnectionId) : null,
    typeof query.replaced === "string" ? getConnection(ws.workspaceId, query.replaced) : null,
    notice.state === "warning" ? connectionTokenHolders(conn.id) : [],
  ]);
  const { today, inAWeek } = dateDefaults();

  const [policy, signedIn] = await Promise.all([
    getConnectionPolicy(conn.id, ws.workspaceId),
    db
      .select({ grantId: oauthGrant.id, clientId: oauthClient.clientId, clientName: oauthClient.clientName, email: user.email, at: oauthGrant.createdAt })
      .from(oauthGrant)
      .innerJoin(oauthClient, eq(oauthClient.id, oauthGrant.oauthClientId))
      .leftJoin(user, eq(user.id, oauthGrant.userId))
      .where(and(eq(oauthGrant.connectionId, conn.id), isNull(oauthGrant.revokedAt)))
      .orderBy(desc(oauthGrant.createdAt)),
  ]);
  const slugs = [...new Set(policy.map((p) => p.integrationSlug))];
  const pickable = new Map<string, PolicySummary[]>(
    await Promise.all(slugs.map(async (slug) => [slug, await pickablePolicies(ws.workspaceId, slug)] as const)),
  );

  return (
    <div>
      <p className="zq-kicker">
        <a href="/app/connections">Connections</a> / {conn.name}
      </p>
      <h1 className="zq-h">
        {conn.name}
        <span className="dot">.</span>
      </h1>
      <p className="zq-item-s" style={{ marginTop: 4 }}>
        <code>{conn.shortId}</code>
      </p>
      <p className="zq-sub">
        {conn.description ? `${conn.description}. ` : ""}
        {isPublic
          ? "Anyone with this URL can use it without signing in. Read only."
          : "Agents sign in as a workspace member. What they can do is this policy narrowed by that person's role."}
      </p>

      {query.created && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Connection created. Add the URL below to your MCP client.</span>
        </div>
      )}
      {query.saved && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Saved. It applies from the next call.</span>
        </div>
      )}

      {replaces && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>
            This replaces <a className="zq-textlink" href={`/app/connections/${replaces.id}`}>{replaces.url}</a>, with the same
            policy.{" "}
            {replaces.sunsetAt
              ? `That one keeps working until ${formatCutoff(replaces.sunsetAt)} and tells clients this URL until then.`
              : "That one keeps working until you sunset it, and tells clients this URL in the meantime."}
          </span>
        </div>
      )}
      {query.sunset && (
        <div className="zq-ok-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            ✓
          </span>
          <span>Sunset scheduled. Clients are told on every call from now on.</span>
        </div>
      )}

      {notice.state !== "live" && (
        <div className="zq-warn-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>
            {notice.state === "warning"
              ? `Being retired on ${formatCutoff(conn.sunsetAt!)}. Until then everything works, and the server's instructions and every result carry`
              : `Retired on ${formatCutoff(conn.sunsetAt!)}. Clients can still connect, but get no tools, only`}{" "}
            this message: &ldquo;{notice.text}&rdquo;
          </span>
        </div>
      )}
      {notice.state === "live" && replacedBy && (
        <div className="zq-warn-box" role="status" style={{ marginTop: 20 }}>
          <span className="ic" aria-hidden="true">
            !
          </span>
          <span>
            Replaced by <a className="zq-textlink" href={`/app/connections/${replacedBy.id}`}>{replacedBy.url}</a>. Every client
            using this URL is pointed there once you set a sunset date below.
          </span>
        </div>
      )}

      <div className="zq-urlbox">
        <code>{conn.url}</code>
        <CopyButton text={conn.url} />
      </div>
      <p className="zq-note">
        The same URL opens{" "}
        <a className="zq-textlink" href={conn.url}>
          this connection&rsquo;s page
        </a>{" "}
        in a browser. Only signed-in workspace members can see it.
      </p>

      {notice.state === "warning" && isAdmin && holders.length > 0 && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            People to tell
          </h2>
          <p className="zq-note" style={{ marginTop: 0 }}>
            These people signed in to this URL. Zeqqat can&rsquo;t send email yet, so let them know about the new URL yourself.
          </p>
          <p className="zq-item-s">{holders.map((h) => h.email).join(", ")}</p>
        </section>
      )}

      <section className="zq-block">
        <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
          Policy
        </h2>
        {policy.length === 0 ? (
          <p className="zq-empty">
            No instances in this workspace yet. <a className="zq-textlink" href="/app/integrations">Add one</a> and it can be
            enabled here.
          </p>
        ) : (
          <form action={savePolicyAction}>
            <input type="hidden" name="connection_id" value={conn.id} />
            <div className="zq-matrix-wrap">
              <table className="zq-matrix zq-policy">
                <thead>
                  <tr>
                    <th>Instance</th>
                    <th>Reachable</th>
                    <th>Policy</th>
                    {KINDS.map((c) => (
                      <th key={c.k}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {policy.map((p) => (
                    <tr key={p.instanceId}>
                      <td>
                        <span className="zq-item-s">{p.integrationName} · </span><b>{p.alias}</b>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          name={`${p.instanceId}:enabled`}
                          defaultChecked={p.enabled}
                          disabled={!isAdmin}
                          aria-label={`${p.alias} reachable`}
                        />
                      </td>
                      <td>
                        <select
                          className="zq-select"
                          name={`${p.instanceId}:policy`}
                          defaultValue={p.policyId ?? ""}
                          disabled={!isAdmin}
                          aria-label={`${p.alias} policy`}
                          style={{ width: "auto" }}
                        >
                          <option value="">By kind (boxes)</option>
                          {(pickable.get(p.integrationSlug) ?? []).map((pol) => (
                            <option key={pol.id} value={pol.id}>
                              {pol.canonical}
                            </option>
                          ))}
                        </select>
                      </td>
                      {KINDS.map((c) => {
                        const capped = isPublic && !ROLE_CAP.public[c.k];
                        return (
                          <td key={c.k} className={capped ? "is-off" : undefined}>
                            <input
                              type="checkbox"
                              name={`${p.instanceId}:${c.k}`}
                              defaultChecked={p.enabled ? p.perm[c.k] : c.k !== "delete" && !capped}
                              disabled={!isAdmin || capped}
                              aria-label={`${p.alias} ${c.label}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin && (
              <button type="submit" className="zq-action zq-action-primary" style={{ marginTop: 14 }}>
                Save policy
              </button>
            )}
          </form>
        )}
        <p className="zq-note">
          With a policy picked, only the tools on its list can run on that instance and the boxes are ignored. Without one,
          the boxes allow tools by kind. <a className="zq-textlink" href="/app/policies">Manage policies</a>.
        </p>
        {!isPublic && (
          <p className="zq-note">
            Through this URL a viewer can only read, a member can read, create and edit, and an admin can do everything
            allowed above.
          </p>
        )}
      </section>

      {!isPublic && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Signed in
          </h2>
          {signedIn.length === 0 ? (
            <p className="zq-empty">No agent has signed in to this connection yet.</p>
          ) : (
            <div className="zq-list">
              {signedIn.map((s) => (
                <div className="zq-item" key={s.grantId}>
                  <div className="zq-item-main">
                    <div className="zq-item-t">{agentHost(s.clientId, s.clientName)}</div>
                    <div className="zq-item-s">
                      {s.email ?? "unknown"} · since {s.at.toUTCString().slice(5, 16)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isAdmin && (
        <section className="zq-block">
          <h2 className="zq-block-t" style={{ marginBottom: 12 }}>
            Manage
          </h2>
          <div className="zq-list">
            {notice.state === "live" && (
              <div className="zq-item">
                <div className="zq-item-main">
                  <div className="zq-item-t">{isPublic ? "Require sign-in" : "Make public"}</div>
                  <div className="zq-item-s">
                    {isPublic
                      ? "Agents will need to sign in as a workspace member."
                      : "Anyone with the URL can read. Write permissions are switched off and signed-in agents are disconnected."}
                  </div>
                </div>
                <div className="zq-item-r">
                  <form action={setAuthModeAction}>
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <input type="hidden" name="auth_mode" value={isPublic ? "members" : "public"} />
                    <button type="submit" className="zq-action zq-action-sm">
                      {isPublic ? "Require sign-in" : "Make public"}
                    </button>
                  </form>
                </div>
              </div>
            )}
            {notice.state !== "cutoff" && (
              <div className="zq-item">
                <div className="zq-item-main">
                  <div className="zq-item-t">Replace</div>
                  <div className="zq-item-s">
                    A new connection with a new URL and this policy. Agents keep using this one until its sunset date, and are
                    told the new URL on every call until then. Leave the date empty to sunset it later.
                  </div>
                  <form action={replaceConnectionAction} id="replace" style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <input className="zq-input" name="name" placeholder={`Name (default ${conn.name})`} autoComplete="off" />
                    <label className="zq-label" htmlFor="replace_cutoff">
                      Sunset this one on
                    </label>
                    <input className="zq-input" id="replace_cutoff" type="date" name="cutoff" min={today} defaultValue={inAWeek} />
                    <input className="zq-input" name="message" placeholder="Extra note for clients (optional)" maxLength={400} />
                  </form>
                  {query.error === "name" && <p className="zq-form-err">Use letters and numbers for the name.</p>}
                </div>
                <div className="zq-item-r">
                  <button type="submit" form="replace" className="zq-action zq-action-sm">
                    Replace
                  </button>
                </div>
              </div>
            )}
            <div className="zq-item">
              <div className="zq-item-main">
                <div className="zq-item-t">{conn.sunsetAt ? "Cancel the sunset" : "Sunset"}</div>
                <div className="zq-item-s">
                  {conn.sunsetAt
                    ? "The URL goes back to serving tools with no notice."
                    : "Pick the last day it serves tools. Until then it works and tells clients the date (and the new URL, if you replaced it). After it, clients can connect but get no tools."}
                </div>
                {!conn.sunsetAt && (
                  <form action={sunsetConnectionAction} id="sunset" style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <input className="zq-input" type="date" name="cutoff" min={today} defaultValue={inAWeek} aria-label="Sunset date" required />
                    <input className="zq-input" name="message" placeholder="Extra note for clients (optional)" maxLength={400} />
                  </form>
                )}
                {query.error === "cutoff" && <p className="zq-form-err">Pick a date.</p>}
              </div>
              <div className="zq-item-r">
                {conn.sunsetAt ? (
                  <form action={reviveConnectionAction}>
                    <input type="hidden" name="connection_id" value={conn.id} />
                    <button type="submit" className="zq-action zq-action-sm">
                      Cancel sunset
                    </button>
                  </form>
                ) : (
                  <button type="submit" form="sunset" className="zq-action zq-action-sm">
                    Sunset
                  </button>
                )}
              </div>
            </div>
            <div className="zq-item">
              <div className="zq-item-main">
                <div className="zq-item-t">Delete</div>
                <div className="zq-item-s">
                  The URL stops answering at once, with no message, and every agent on it is signed out. Prefer Sunset when people
                  still use it. Type delete to confirm.
                </div>
                <form action={deleteConnectionAction} id="del" style={{ marginTop: 10 }}>
                  <input type="hidden" name="connection_id" value={conn.id} />
                  <input className="zq-input" name="confirm" placeholder="delete" autoComplete="off" />
                </form>
                {query.error === "confirm" && <p className="zq-form-err">Type delete to confirm.</p>}
              </div>
              <div className="zq-item-r">
                <button type="submit" form="del" className="zq-action zq-action-sm zq-action-danger">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
