import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { agentRequest } from "../db/schema";
import { newId } from "./id";
import { scrubSecrets } from "./scrub";

// Requests group calls on the Activity page (project doc
// activity-request-card-v1). The agent gives a one-line `reason` on every
// search, describe and run call, worded the same for every call it makes
// for one user request; Zeqqat does the grouping.

// A reason that reappears after this long starts a new request: the same
// sentence an hour later is a new thing the user asked for.
export const REQUEST_WINDOW_MS = 30 * 60 * 1000;

export const MAX_REASON_CHARS = 300;

// The built-ins a reason is required on. whoami, policy and docs take one
// optionally, so they join the request when the agent passes it.
export const REASON_REQUIRED = new Set(["search", "describe", "run", "secret"]);

export const REASON_DESCRIPTION =
  "Required. One line saying what the user asked you to do, in plain words (e.g. \"Redeploy My App so the new env vars take effect\"). Use exactly the same wording on every call you make for the same request. People read it in the Zeqqat activity log.";

export const REASON_MISSING =
  "reason is required: one line saying what the user asked you to do, worded the same on every call for this request (e.g. \"Redeploy My App so the new env vars take effect\"). Call again with reason set. Zeqqat shows it to the people who audit this connection.";

// Trimmed, single-spaced, scrubbed and capped, or null when there is
// nothing left. Pure, so it is tested directly.
export function normalizeReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = scrubSecrets(raw.replace(/\s+/g, " ").trim());
  if (!cleaned) return null;
  return cleaned.length > MAX_REASON_CHARS ? `${cleaned.slice(0, MAX_REASON_CHARS - 1)}…` : cleaned;
}

// The request this call belongs to: the open one with the same person,
// agent and reason, or a new one. Public connections have no person, so
// they group by connection instead.
export async function resolveRequest(params: {
  userId: string | null;
  oauthClientId: string | null;
  connectionId: string;
  reason: string;
}): Promise<string> {
  const since = new Date(Date.now() - REQUEST_WINDOW_MS);
  const who = params.userId
    ? eq(agentRequest.userId, params.userId)
    : and(isNull(agentRequest.userId), eq(agentRequest.connectionId, params.connectionId));
  const client = params.oauthClientId ? eq(agentRequest.oauthClientId, params.oauthClientId) : isNull(agentRequest.oauthClientId);

  const [open] = await db
    .select({ id: agentRequest.id })
    .from(agentRequest)
    .where(and(who, client, eq(agentRequest.reason, params.reason), gt(agentRequest.lastCallAt, since)))
    .orderBy(desc(agentRequest.lastCallAt))
    .limit(1);

  if (open) {
    await db.update(agentRequest).set({ lastCallAt: new Date() }).where(eq(agentRequest.id, open.id));
    return open.id;
  }

  const id = newId();
  await db.insert(agentRequest).values({
    id,
    userId: params.userId,
    oauthClientId: params.oauthClientId,
    connectionId: params.userId ? null : params.connectionId,
    reason: params.reason,
  });
  return id;
}
