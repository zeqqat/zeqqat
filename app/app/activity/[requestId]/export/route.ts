import { getRequest } from "../../../../../lib/activity";
import { getServerSession } from "../../../../../lib/session";
import { getUserWorkspace } from "../../../../../lib/workspace";

// "Export as JSON" from a request card's menu: the request and every call
// the viewer can see, times in UTC.
export async function GET(_request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const session = await getServerSession();
  if (!session?.user) return new Response("Not found", { status: 404 });
  const ws = await getUserWorkspace(session.user.id);
  if (!ws) return new Response("Not found", { status: 404 });
  const { requestId } = await params;
  const found = await getRequest({ userId: session.user.id, ws }, requestId);
  if (!found) return new Response("Not found", { status: 404 });

  const { card, calls } = found;
  const body = {
    request: {
      id: card.id,
      reason: card.reason,
      person: card.person ? { name: card.person.name, username: card.person.username } : null,
      agent: card.agent.host,
      startedAt: card.startedAt,
      lastCallAt: card.lastAt,
    },
    calls: calls.map((c) => ({
      id: c.id,
      at: c.at,
      outcome: c.state,
      tool: c.lookup ? null : c.toolName,
      lookup: c.lookup,
      operationId: c.op,
      kind: c.kind,
      instance: c.instanceAlias,
      connection: c.connectionName,
      workspace: c.workspaceName,
      inputs: c.inputs,
      request: c.outbound,
      response: c.response,
      httpStatus: c.httpStatus,
      durationMs: c.durationMs,
      error: c.errorMessage,
      policy: c.policyName ? { name: c.policyName, version: c.policyVersion } : null,
      role: c.callerRole,
      spec: c.specRelease,
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="zeqqat-request-${card.id}.json"`,
    },
  });
}
