import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { toolsSeen } from "../db/schema";

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
    .values({ key, fingerprint, notified: null })
    .onConflictDoUpdate({ target: toolsSeen.key, set: { fingerprint, notified: null, updatedAt: sql`now()` } });
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
