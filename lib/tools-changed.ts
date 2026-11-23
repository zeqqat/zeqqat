import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { connection, oauthClient, organization, toolsSeen, workspace } from "../db/schema";
import { agentBrand } from "./mcp-urls";

// Telling agents when the tool list changes. Agents keep the list they
// fetched (Claude keeps it until you reconnect), so after an update that
// renames tools, or a policy change that adds or removes a run tool, they
// would go on with the old one. Zeqqat declares `tools.listChanged` and,
// because it has no standing connection to push on (every request is a
// POST, GET is 405), it says so in the answer to the agent's next call:
// that answer becomes an event stream whose first message is
// `notifications/tools/list_changed`, then the result as usual (MCP
// Streamable HTTP lets a server send notifications before the response).
// Each change is announced once per MCP URL + person + agent.

export function toolsFingerprint(tools: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(tools)).digest("base64url").slice(0, 22);
}

// Remember the list this agent just fetched.
export async function rememberToolsSeen(key: string, fingerprint: string): Promise<void> {
  await db
    .insert(toolsSeen)
    .values({ key, fingerprint, notified: null, current: fingerprint })
    .onConflictDoUpdate({ target: toolsSeen.key, set: { fingerprint, notified: null, current: fingerprint, updatedAt: sql`now()` } });
}

// On every call: the list Zeqqat would give this agent now, so the
// dashboard can tell an agent that kept an old list (lib/tools-changed.ts).
export async function noteCurrentTools(key: string, current: string): Promise<void> {
  await db
    .insert(toolsSeen)
    .values({ key, fingerprint: "", current })
    .onConflictDoUpdate({ target: toolsSeen.key, set: { current, updatedAt: sql`now()` } });
}

// The key for a signed-in caller: MCP URL, person, agent (oauth_client id).
export function seenKeyFor(connectionId: string, userId: string, oauthClientId: string | null): string {
  return `${connectionId}:${userId}:${oauthClientId ?? ""}`;
}

// Agents still working from an old tool list, as "userId:oauthClientId",
// for one MCP URL or for one person. An agent Zeqqat has seen call since an
// update but never fetch the list again counts too.
export async function staleAgents(filter: { connectionId?: string; userId?: string }): Promise<{ connectionId: string; userId: string; clientId: string }[]> {
  const rows = await db
    .select({ key: toolsSeen.key, fingerprint: toolsSeen.fingerprint, current: toolsSeen.current })
    .from(toolsSeen)
    .where(sql`${toolsSeen.current} is not null and ${toolsSeen.current} <> ${toolsSeen.fingerprint}`);
  const out: { connectionId: string; userId: string; clientId: string }[] = [];
  for (const r of rows) {
    const [connectionId, userId, clientId] = r.key.split(":");
    if (!userId || !clientId) continue;
    if (filter.connectionId && connectionId !== filter.connectionId) continue;
    if (filter.userId && userId !== filter.userId) continue;
    out.push({ connectionId, userId, clientId });
  }
  return out;
}

// Whether to announce a change on this call. True once per new list the
// agent hasn't fetched yet; an agent Zeqqat has never seen fetch a list
// (it fetched one before this existed) is told once too, which is harmless:
// it just fetches the list again.
export async function shouldAnnounce(key: string, fingerprint: string): Promise<boolean> {
  const [row] = await db.select().from(toolsSeen).where(eq(toolsSeen.key, key));
  if (row && (row.fingerprint === fingerprint || row.notified === fingerprint)) return false;
  await db
    .insert(toolsSeen)
    .values({ key, fingerprint: row?.fingerprint ?? "", notified: fingerprint })
    .onConflictDoUpdate({ target: toolsSeen.key, set: { notified: fingerprint, updatedAt: sql`now()` } });
  return true;
}

export const LIST_CHANGED = { jsonrpc: "2.0", method: "notifications/tools/list_changed" } as const;

// The answer as an event stream: the notification first, then the result.
export function withListChanged(result: unknown, status: number): Response {
  const event = (m: unknown) => `event: message\ndata: ${JSON.stringify(m)}\n\n`;
  return new Response(event(LIST_CHANGED) + event(result), {
    status,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

export function acceptsEventStream(request: Request): boolean {
  return (request.headers.get("accept") ?? "").toLowerCase().includes("text/event-stream");
}

// Whether this agent is working from an old list right now: the list it
// last fetched isn't the one it would get. An agent Zeqqat never saw fetch
// a list (it fetched one before this existed) counts as behind.
export async function isBehind(key: string, current: string): Promise<boolean> {
  const [row] = await db.select({ fingerprint: toolsSeen.fingerprint }).from(toolsSeen).where(eq(toolsSeen.key, key));
  return !row || row.fingerprint !== current;
}

// One person's agents on an old list, everywhere they're connected, for the
// banner only they see (components/StaleToolsBanner.tsx). Reconnecting is
// per MCP URL, so each entry names the agent and the MCP URL.
export type StaleEntry = { agent: string; mcpUrl: string; account: string; workspace: string };

export async function staleForUser(userId: string): Promise<StaleEntry[]> {
  const mine = await staleAgents({ userId });
  if (mine.length === 0) return [];
  const conns = await db
    .select({ id: connection.id, name: connection.name, shortId: connection.shortId, account: organization.slug, workspace: workspace.slug })
    .from(connection)
    .innerJoin(organization, eq(organization.id, connection.organizationId))
    .innerJoin(workspace, eq(workspace.id, connection.workspaceId))
    .where(and(inArray(connection.id, [...new Set(mine.map((m) => m.connectionId))]), isNull(connection.deletedAt)));
  const clients = await db
    .select({ id: oauthClient.id, clientId: oauthClient.clientId, name: oauthClient.clientName })
    .from(oauthClient)
    .where(inArray(oauthClient.id, [...new Set(mine.map((m) => m.clientId))]));
  const out: StaleEntry[] = [];
  for (const m of mine) {
    const c = conns.find((x) => x.id === m.connectionId);
    const cl = clients.find((x) => x.id === m.clientId);
    if (!c || !cl) continue;
    const e = { agent: agentBrand(cl.clientId, cl.name).label, mcpUrl: `${c.name}/${c.shortId}`, account: c.account, workspace: c.workspace };
    if (!out.some((o) => o.agent === e.agent && o.mcpUrl === e.mcpUrl && o.account === e.account)) out.push(e);
  }
  return out;
}

// The agent's name for the notice it gets ("Claude"), from its OAuth client.
export async function agentLabel(oauthClientId: string | null): Promise<string> {
  if (!oauthClientId) return "your agent";
  const [c] = await db.select({ clientId: oauthClient.clientId, name: oauthClient.clientName }).from(oauthClient).where(eq(oauthClient.id, oauthClientId));
  return c ? agentBrand(c.clientId, c.name).label : "your agent";
}
