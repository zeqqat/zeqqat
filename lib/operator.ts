import { and, eq, gte, sql, desc, count } from "drizzle-orm";
import { db } from "../db";
import { account, agentRequest, callLog, membership, organization, telemetryInstall, user } from "../db/schema";
import { OFFICIAL_ORG_SLUG } from "./official-catalog";

// The operator runs this install: the owner of the @zeqqat organization
// (lib/official-catalog.ts). Only they see the Operator page, which counts
// sign-ups, use and (on zeqqat.com) self-hosted installs.

export async function isOperator(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: membership.id })
    .from(membership)
    .innerJoin(organization, eq(organization.id, membership.organizationId))
    .where(and(eq(membership.userId, userId), eq(organization.slug, OFFICIAL_ORG_SLUG), eq(membership.role, "owner")))
    .limit(1);
  return Boolean(row);
}

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

async function countUsers(since?: Date): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(since ? gte(user.createdAt, since) : undefined);
  return Number(row?.n ?? 0);
}

async function countCalls(since?: Date): Promise<number> {
  const [row] = await db.select({ n: count() }).from(callLog).where(since ? gte(callLog.createdAt, since) : undefined);
  return Number(row?.n ?? 0);
}

async function countRequests(since: Date): Promise<number> {
  const [row] = await db.select({ n: count() }).from(agentRequest).where(gte(agentRequest.startedAt, since));
  return Number(row?.n ?? 0);
}

export type OperatorStats = Awaited<ReturnType<typeof operatorStats>>;

export async function operatorStats() {
  const [usersTotal, users7, users30, requests7, calls7, callsTotal] = await Promise.all([
    countUsers(),
    countUsers(ago(7)),
    countUsers(ago(30)),
    countRequests(ago(7)),
    countCalls(ago(7)),
    countCalls(),
  ]);

  const recentUsers = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      providers: sql<string>`coalesce(string_agg(distinct ${account.providerId}, ', '), '')`,
    })
    .from(user)
    .leftJoin(account, eq(account.userId, user.id))
    .groupBy(user.id)
    .orderBy(desc(user.createdAt))
    .limit(25);

  // Sign-ups per day, last 30 days, gaps filled with zero.
  const daily = await db.execute(sql`
    select to_char(d, 'YYYY-MM-DD') as day, count(u.id)::int as n
    from generate_series((now() - interval '29 days')::date, now()::date, interval '1 day') d
    left join "user" u on u.created_at::date = d::date
    group by d order by d`);

  const installsTotal = Number((await db.select({ n: count() }).from(telemetryInstall))[0]?.n ?? 0);
  const installsActive = Number(
    (await db.select({ n: count() }).from(telemetryInstall).where(gte(telemetryInstall.lastSeenAt, ago(7))))[0]?.n ?? 0,
  );
  const installsNew7 = Number(
    (await db.select({ n: count() }).from(telemetryInstall).where(gte(telemetryInstall.firstSeenAt, ago(7))))[0]?.n ?? 0,
  );
  const versions = await db
    .select({ version: telemetryInstall.version, n: count() })
    .from(telemetryInstall)
    .where(gte(telemetryInstall.lastSeenAt, ago(7)))
    .groupBy(telemetryInstall.version)
    .orderBy(desc(count()));
  const installs = await db
    .select()
    .from(telemetryInstall)
    .orderBy(desc(telemetryInstall.lastSeenAt))
    .limit(25);

  return {
    users: { total: usersTotal, last7: users7, last30: users30, recent: recentUsers },
    signupsDaily: daily.rows as { day: string; n: number }[],
    usage: { requests7, calls7, callsTotal },
    installs: { total: installsTotal, active7: installsActive, new7: installsNew7, versions, recent: installs },
  };
}

export type RepoStats = { stars: number; forks: number; watchers: number; openIssues: number } | null;

// Public numbers from GitHub's API, no token needed. Cached for an hour;
// null when GitHub can't be reached.
export async function repoStats(repo = "zeqqat/zeqqat"): Promise<RepoStats> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "zeqqat-operator" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const r = (await res.json()) as { stargazers_count: number; forks_count: number; subscribers_count: number; open_issues_count: number };
    return { stars: r.stargazers_count, forks: r.forks_count, watchers: r.subscribers_count, openIssues: r.open_issues_count };
  } catch {
    return null;
  }
}
