import { timingSafeEqual } from "node:crypto";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import { account, agentRequest, callLog, telemetryInstall, user } from "../db/schema";

// The operator's numbers for this install, served read-only at
// /api/operator/* for a dashboard to read (through Zeqqat itself, by
// importing /api/operator/openapi.json as an app). Off unless
// ZEQQAT_OPERATOR_KEY is set; every call needs it as a Bearer token.

export function operatorKey(): string | null {
  const key = process.env.ZEQQAT_OPERATOR_KEY?.trim();
  return key && key.length >= 32 ? key : null;
}

// null = the API is off (answer 404); false = wrong or missing key (401).
export function checkOperatorKey(request: Request): boolean | null {
  const key = operatorKey();
  if (!key) return null;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const n = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);

export async function summary() {
  const [usersTotal, users7, users30, requests7, calls7, callsTotal, installsTotal, installsActive7, installsNew7] = await Promise.all([
    db.select({ n: count() }).from(user).then(n),
    db.select({ n: count() }).from(user).where(gte(user.createdAt, ago(7))).then(n),
    db.select({ n: count() }).from(user).where(gte(user.createdAt, ago(30))).then(n),
    db.select({ n: count() }).from(agentRequest).where(gte(agentRequest.startedAt, ago(7))).then(n),
    db.select({ n: count() }).from(callLog).where(gte(callLog.createdAt, ago(7))).then(n),
    db.select({ n: count() }).from(callLog).then(n),
    db.select({ n: count() }).from(telemetryInstall).then(n),
    db.select({ n: count() }).from(telemetryInstall).where(gte(telemetryInstall.lastSeenAt, ago(7))).then(n),
    db.select({ n: count() }).from(telemetryInstall).where(gte(telemetryInstall.firstSeenAt, ago(7))).then(n),
  ]);
  return {
    usersTotal,
    usersNew7d: users7,
    usersNew30d: users30,
    agentRequests7d: requests7,
    toolCalls7d: calls7,
    toolCallsTotal: callsTotal,
    installsSeen: installsTotal,
    installsActive7d: installsActive7,
    installsNew7d: installsNew7,
    generatedAt: new Date().toISOString(),
  };
}

// One row per day, oldest first, gaps filled with zero.
export async function daily(days: number) {
  const res = await db.execute(sql`
    select to_char(d, 'YYYY-MM-DD') as day,
      (select count(*) from "user" u where u.created_at::date = d::date)::int as signups,
      (select count(*) from call_log c where c.created_at::date = d::date)::int as tool_calls,
      (select count(*) from telemetry_install t where t.first_seen_at::date = d::date)::int as new_installs
    from generate_series((now() - make_interval(days => ${days - 1}))::date, now()::date, interval '1 day') d
    order by d`);
  return res.rows as { day: string; signups: number; tool_calls: number; new_installs: number }[];
}

export async function latestUsers(limit: number) {
  const rows = await db
    .select({
      name: user.name,
      email: user.email,
      providers: sql<string>`coalesce(string_agg(distinct ${account.providerId}, ', '), '')`,
      joinedAt: user.createdAt,
    })
    .from(user)
    .leftJoin(account, eq(account.userId, user.id))
    .groupBy(user.id)
    .orderBy(desc(user.createdAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
}

export async function installs(limit: number) {
  const rows = await db.select().from(telemetryInstall).orderBy(desc(telemetryInstall.lastSeenAt)).limit(limit);
  return rows.map((r) => ({
    install: r.installId.slice(0, 8),
    version: r.version,
    firstSeenAt: r.firstSeenAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    pings: r.pingCount,
    active: r.lastSeenAt >= ago(7),
  }));
}

export async function versions() {
  return db
    .select({ version: telemetryInstall.version, installs: count() })
    .from(telemetryInstall)
    .where(gte(telemetryInstall.lastSeenAt, ago(7)))
    .groupBy(telemetryInstall.version)
    .orderBy(desc(count()));
}
