import { notFound } from "next/navigation";
import {
  CallCard,
  LookupLine,
} from "../../../../../../components/activity/CallCard";
import { JsonView } from "../../../../../../components/activity/JsonView";
import { ExactTime } from "../../../../../../components/activity/Time";
import { durationText } from "../../../../../../lib/activity-format";
import { CrumbTrail } from "../../../../../../components/AppShell";
import { getCall, getRequest } from "../../../../../../lib/activity";
import { RequestCard } from "../../../../../../components/activity/RequestCard";
import { here, requireWorkspace } from "../../../../../../lib/guard";
import { AgentMark, agentName } from "../../../../../../components/Marks";
import { CallTabs } from "../../../../../../components/activity/CallTabs";
import { InfoBubble } from "../../../../../../components/activity/InfoBubble";

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

// One call, everything Zeqqat recorded about it: the request it belongs to
// on top, joined to the call card by a thread line (like a reply), then
// tabs: what the agent passed, the request Zeqqat sent to the app, the
// response the agent saw, and the details.
export default async function CallPage({
  params,
  searchParams,
}: {
  params: Promise<{ callId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const base = await here();
  const { user, ws } = await requireWorkspace();
  const { callId } = await params;
  const { tab = "agent" } = await searchParams;
  const found = await getCall({ userId: user.id, ws }, callId);
  if (!found) notFound();
  const { call, request, index, total, prev, next } = found;
  const position = `Call ${index + 1} of ${total}`;
  const parent = request ? await getRequest({ userId: user.id, ws }, request.id) : null;

  const appName = call.integrationRef?.split("/")[1] ?? "the app";
  const app = appName.charAt(0).toUpperCase() + appName.slice(1);
  const responseLabel =
    call.state === "blocked"
      ? "never sent"
      : call.state === "running"
        ? "waiting"
        : `${call.httpStatus ?? "no status"} · as the agent saw it`;

  return (
    <div className="zq-act-page">
      <CrumbTrail
        items={[
          ...(call.person?.username
            ? [{ text: `@${call.person.username}`, href: `${base}/activity?person=${encodeURIComponent(call.person.username)}` }]
            : []),
          ...(request ? [{ text: request.reason, href: `${base}/activity/${request.id}` }] : []),
          { text: request ? position : call.lookup ? "Lookup" : "Call" },
        ]}
      />
      <div className={`zq-act-sheet${parent ? " zq-thread" : ""}`}>
        {parent && <RequestCard card={parent.card} linked base={base} />}
        {call.lookup ? <LookupLine call={call} /> : <CallCard call={call} position={request ? position : undefined} />}
        <CallTabs
          initial={tab}
          tabs={[
            ...(call.lookup
              ? []
              : [
                  {
                    id: "agent",
                    label: "From the agent",
                    content: (
                      <>
                        <div className="zq-act-block-h">
                          <b>zeqqat_run</b>
                          <span>
                            {call.connectionName
                              ? `through ${call.connectionName}`
                              : "what the agent passed"}
                          </span>
                        </div>
                        <div className="zq-json-box has-info">
                          <InfoBubble title="From the agent">
                            What the agent passed to Zeqqat to make this call:
                            the tool, the instance, the inputs and its reason.
                          </InfoBubble>
                          <JsonView
                            value={{
                              name: call.op ?? call.toolName,
                              instance: call.instanceAlias,
                              inputs: call.inputs ?? {},
                              reason: call.reason,
                            }}
                          />
                        </div>
                      </>
                    ),
                  },
                  {
                    id: "request",
                    label: `To ${app}`,
                    content: (
                      <>
                        <div className="zq-act-block-h">
                          <b>Request</b>
                          <span>Zeqqat to {app}</span>
                        </div>
                        {call.outbound ? (
                          <div className="zq-json-box">
                            <JsonView
                              value={inOrder(call.outbound, [
                                "method",
                                "url",
                                "query",
                                "body",
                                "headers",
                              ])}
                            />
                          </div>
                        ) : (
                          <p className="zq-act-note">
                            {call.state === "blocked"
                              ? `Nothing was sent to ${app}: the call was stopped before it left Zeqqat.`
                              : `Not recorded. Calls made before Zeqqat recorded outgoing requests don't have it.`}
                          </p>
                        )}
                      </>
                    ),
                  },
                ]),
            {
              id: "response",
              label: "Response",
              content: (
                <>
                  <div className="zq-act-block-h">
                    <b>Response</b>
                    <span>{responseLabel}</span>
                  </div>
                  {call.response != null ? (
                    <div className="zq-json-box">
                      <JsonView value={call.response} />
                    </div>
                  ) : (
                    <p className="zq-act-note">
                      {call.errorMessage ?? "No response."}
                    </p>
                  )}
                  {call.redactions > 0 && (
                    <p className="zq-act-note">
                      {call.redactions === 1
                        ? "1 value was"
                        : `${call.redactions} values were`}{" "}
                      replaced before the agent saw this response. Zeqqat never
                      stored the originals.
                    </p>
                  )}
                </>
              ),
            },
            {
              id: "details",
              label: "Details",
              content: (
                <>
                  <div className="zq-act-block-h">
                    <b>Details</b>
                  </div>
                  <dl className="zq-det">
                    <dt className="gh">Result</dt>
                    <dt>outcome</dt>
                    <dd>
                      {
                        {
                          ok: "done",
                          running: "running",
                          blocked: "blocked",
                          error: "failed",
                        }[call.state]
                      }
                    </dd>
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
                          {call.person.name}{" "}
                          {call.person.username && (
                            <small>@{call.person.username}</small>
                          )}
                          {call.callerRole && (
                            <small> · {call.callerRole}</small>
                          )}
                        </>
                      ) : (
                        "Public MCP URL, no sign-in"
                      )}
                    </dd>
                    <dt>agent</dt>
                    <dd
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <AgentMark host={call.agent.host} size={13} />{" "}
                      {agentName(call.agent.host)}{" "}
                      <small>{call.agent.host}</small>
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
                      @{call.account.username}{" "}
                      <small>{call.account.type}</small>
                    </dd>
                    <dt>workspace</dt>
                    <dd>{call.workspaceName}</dd>
                    {call.connectionName && (
                      <>
                        <dt>MCP URL</dt>
                        <dd>
                          {call.connectionName}{" "}
                          {call.connectionUrl && (
                            <small>{call.connectionUrl}</small>
                          )}
                        </dd>
                      </>
                    )}
                    {call.instanceAlias && (
                      <>
                        <dt>instance</dt>
                        <dd>
                          {call.instanceAlias}{" "}
                          {call.instanceBaseUrl && (
                            <small>{call.instanceBaseUrl}</small>
                          )}
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
                              {call.policyName}{" "}
                              {call.policyVersion != null && (
                                <small>v{call.policyVersion}</small>
                              )}
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
                </>
              ),
            },
          ]}
        />
      </div>

      {request && (prev || next) && (
        <nav className="zq-pager" aria-label="Other calls in this request">
          {prev ? (
            <a href={`${base}/activity/call/${prev.id}`}>
              <small>&lsaquo; Previous</small>
              <span>{prev.toolName.replace(/^@[^/]+\//, "")}</span>
            </a>
          ) : (
            <span className="is-empty" />
          )}
          {next ? (
            <a href={`${base}/activity/call/${next.id}`} className="is-next">
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
