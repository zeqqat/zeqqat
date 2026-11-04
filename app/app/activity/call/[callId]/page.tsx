import { notFound } from "next/navigation";
import { CallCard, LookupLine } from "../../../../../components/activity/CallCard";
import { JsonView } from "../../../../../components/activity/JsonView";
import { BackLink } from "../../../../../components/activity/Parts";
import { ExactTime } from "../../../../../components/activity/Time";
import { durationText } from "../../../../../lib/activity-format";
import { getCall } from "../../../../../lib/activity";
import { requireWorkspace } from "../../../../../lib/guard";
import { AgentMark, agentName } from "../../../../../components/Marks";

// Postgres jsonb doesn't keep key order; put the request's keys back in
// the order people read a request in.
function inOrder(value: unknown, keys: string[]): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in v) out[k] = v[k];
  for (const k of Object.keys(v)) if (!(k in out)) out[k] = v[k];
  return out;
}

// One call, everything Zeqqat recorded about it: the call card, the request
// Zeqqat sent to the app, the response the agent saw, and the details.
export default async function CallPage({ params }: { params: Promise<{ callId: string }> }) {
  const { user, ws } = await requireWorkspace();
  const { callId } = await params;
  const found = await getCall({ userId: user.id, ws }, callId);
  if (!found) notFound();
  const { call, request, index, total, prev, next } = found;

  const appName = call.integrationRef?.split("/")[1] ?? "the app";
  const app = appName.charAt(0).toUpperCase() + appName.slice(1);
  const responseLabel =
    call.state === "blocked" ? "never sent" : call.state === "running" ? "waiting" : `${call.httpStatus ?? "no status"} · as the agent saw it`;

  return (
    <div className="zq-act-page">
      <div>
        <BackLink href={request ? `/app/activity/${request.id}` : "/app/activity"}>{request ? "Request" : "Activity"}</BackLink>
        {request && (
          <span className="zq-crumb-of">
            Call {index + 1} of {total} in &ldquo;{request.reason}&rdquo;
          </span>
        )}
      </div>

      <div className="zq-act-sheet">{call.lookup ? <LookupLine call={call} /> : <CallCard call={call} />}</div>

      {!call.lookup && (
        <section className="zq-act-block">
          <div className="zq-act-block-h">
            <b>Request</b>
            <span>Zeqqat to {app}</span>
          </div>
          {call.outbound ? (
            <div className="zq-json-box">
              <JsonView value={inOrder(call.outbound, ["method", "url", "query", "body", "headers"])} />
            </div>
          ) : (
            <p className="zq-act-note">
              {call.state === "blocked"
                ? `Nothing was sent to ${app}: the call was stopped before it left Zeqqat.`
                : `Not recorded. Calls made before Zeqqat recorded outgoing requests don't have it.`}
            </p>
          )}
        </section>
      )}

      <section className="zq-act-block">
        <div className="zq-act-block-h">
          <b>Response</b>
          <span>{responseLabel}</span>
        </div>
        {call.response != null ? (
          <div className="zq-json-box">
            <JsonView value={call.response} />
          </div>
        ) : (
          <p className="zq-act-note">{call.errorMessage ?? "No response."}</p>
        )}
        {call.redactions > 0 && (
          <p className="zq-act-note">
            {call.redactions === 1 ? "1 value was" : `${call.redactions} values were`} replaced before the agent saw this response.
            Zeqqat never stored the originals.
          </p>
        )}
      </section>

      <section className="zq-act-block">
        <div className="zq-act-block-h">
          <b>Details</b>
        </div>
        <dl className="zq-det">
          <dt className="gh">Result</dt>
          <dt>outcome</dt>
          <dd>{{ ok: "done", running: "running", blocked: "blocked", error: "failed" }[call.state]}</dd>
          {call.httpStatus != null && (
            <>
              <dt>status</dt>
              <dd>{call.httpStatus}</dd>
            </>
          )}
          {call.state !== "running" && call.state !== "blocked" && (
            <>
              <dt>duration</dt>
              <dd>{durationText(call.durationMs)}</dd>
            </>
          )}
          <dt>started</dt>
          <dd>
            <ExactTime iso={call.at} />
          </dd>
          {call.errorMessage && (
            <>
              <dt>error</dt>
              <dd>{call.errorMessage}</dd>
            </>
          )}

          <dt className="gh">Who</dt>
          <dt>person</dt>
          <dd>
            {call.person ? (
              <>
                {call.person.name} {call.person.username && <small>@{call.person.username}</small>}
                {call.callerRole && <small> · {call.callerRole}</small>}
              </>
            ) : (
              "Public connection, no sign-in"
            )}
          </dd>
          <dt>agent</dt>
          <dd style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <AgentMark host={call.agent.host} size={13} /> {agentName(call.agent.host)} <small>{call.agent.host}</small>
          </dd>
          {call.reason && (
            <>
              <dt>reason</dt>
              <dd>{call.reason}</dd>
            </>
          )}

          <dt className="gh">Where</dt>
          <dt>account</dt>
          <dd>
            @{call.account.username} <small>{call.account.type}</small>
          </dd>
          <dt>workspace</dt>
          <dd>{call.workspaceName}</dd>
          {call.connectionName && (
            <>
              <dt>connection</dt>
              <dd>
                {call.connectionName} {call.connectionUrl && <small>{call.connectionUrl}</small>}
              </dd>
            </>
          )}
          {call.instanceAlias && (
            <>
              <dt>instance</dt>
              <dd>
                {call.instanceAlias} {call.instanceBaseUrl && <small>{call.instanceBaseUrl}</small>}
              </dd>
            </>
          )}

          {!call.lookup && (
            <>
              <dt className="gh">Rules</dt>
              <dt>policy</dt>
              <dd>
                {call.policyName ? (
                  <>
                    {call.policyName} {call.policyVersion != null && <small>v{call.policyVersion}</small>}
                  </>
                ) : (
                  <small>none attached, allowed by kind</small>
                )}
              </dd>
              {call.kind && (
                <>
                  <dt>kind</dt>
                  <dd>{call.kind}</dd>
                </>
              )}

              <dt className="gh">Tool</dt>
              {call.integrationRef && (
                <>
                  <dt>integration</dt>
                  <dd>{call.integrationRef}</dd>
                </>
              )}
              {call.op && (
                <>
                  <dt>operationId</dt>
                  <dd>{call.op}</dd>
                </>
              )}
              {call.specRelease && (
                <>
                  <dt>spec</dt>
                  <dd>
                    {app} {call.specRelease}
                  </dd>
                </>
              )}
            </>
          )}

          <dt className="gh">Record</dt>
          <dt>call id</dt>
          <dd>{call.id}</dd>
          {call.requestId && (
            <>
              <dt>request id</dt>
              <dd>{call.requestId}</dd>
            </>
          )}
        </dl>
      </section>

      {request && (prev || next) && (
        <nav className="zq-pager" aria-label="Other calls in this request">
          {prev ? (
            <a href={`/app/activity/call/${prev.id}`}>
              <small>&lsaquo; Previous</small>
              <span>{prev.toolName.replace(/^@[^/]+\//, "")}</span>
            </a>
          ) : (
            <span className="is-empty" />
          )}
          {next ? (
            <a href={`/app/activity/call/${next.id}`} className="is-next">
              <small>Next &rsaquo;</small>
              <span>{next.toolName.replace(/^@[^/]+\//, "")}</span>
            </a>
          ) : (
            <span className="is-empty" />
          )}
        </nav>
      )}
    </div>
  );
}
