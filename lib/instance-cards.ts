import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { callLog, connection, connectionGrant, instance, oauthGrant } from "../db/schema";
import { decryptCredential } from "./crypto";
import { normalizeBaseUrl, testDokployConnection } from "./dokploy-check";
import { fetchDokploySpec } from "./instance-spec";
import type { Usage } from "./mcp-urls";
import { appCallsOnly } from "./overview";

// Data for the Dokploy Instances cards (app/[org]/[ws]/dokploy-instances): calls
// per instance over time, how many MCP URLs reach each one and how many
// people are connected through them, and a fresh look at each Dokploy's
// health and version.

function dayStart(d = new Date()) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Calls to apps per instance: 30 UTC days (today last) and today's 24 UTC
// hours, the same shape and rule as the MCP URLs cards.
export async function usageByInstance(workspaceId: string, instanceIds: string[]): Promise<Map<string, Usage>> {
  const out = new Map<string, Usage>(instanceIds.map((id) => [id, { days: Array(30).fill(0), hours: Array(24).fill(0) }]));
  if (instanceIds.length === 0) return out;
  const today = dayStart();
  const from = new Date(today.getTime() - 29 * 86_400_000);
  const scope = and(eq(callLog.workspaceId, workspaceId), inArray(callLog.instanceId, instanceIds), appCallsOnly);
  const [dayRows, hourRows] = await Promise.all([
    db
      .select({
        id: callLog.instanceId,
        day: sql<string>`to_char(date_trunc('day', ${callLog.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        n: sql<number>`count(*)::int`,
      })
      .from(callLog)
      .where(and(scope, gte(callLog.createdAt, from)))
      .groupBy(callLog.instanceId, sql`2`),
    db
      .select({
        id: callLog.instanceId,
        hour: sql<number>`extract(hour from ${callLog.createdAt} at time zone 'UTC')::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(callLog)
      .where(and(scope, gte(callLog.createdAt, today)))
      .groupBy(callLog.instanceId, sql`2`),
  ]);
  for (const r of dayRows) {
    const u = r.id ? out.get(r.id) : undefined;
    if (!u) continue;
    const i = 29 - Math.round((today.getTime() - new Date(`${r.day}T00:00:00Z`).getTime()) / 86_400_000);
    if (i >= 0 && i < 30) u.days[i] = r.n;
  }
  for (const r of hourRows) {
    const u = r.id ? out.get(r.id) : undefined;
    if (u && r.hour >= 0 && r.hour < 24) u.hours[r.hour] = r.n;
  }
  return out;
}

// Per instance: the live MCP URLs that reach it, and the people with a live
// sign-in on any of them ("who else is in here?").
export async function instanceCounts(instanceIds: string[]) {
  const urls = new Map<string, number>();
  const people = new Map<string, number>();
  if (instanceIds.length === 0) return { urls, people };
  const [u, p] = await Promise.all([
    db
      .select({ id: connectionGrant.instanceId, n: sql<number>`count(distinct ${connectionGrant.connectionId})::int` })
      .from(connectionGrant)
      .innerJoin(connection, eq(connection.id, connectionGrant.connectionId))
      .where(and(inArray(connectionGrant.instanceId, instanceIds), isNull(connection.deletedAt)))
      .groupBy(connectionGrant.instanceId),
    db
      .select({ id: connectionGrant.instanceId, n: sql<number>`count(distinct ${oauthGrant.userId})::int` })
      .from(connectionGrant)
      .innerJoin(connection, eq(connection.id, connectionGrant.connectionId))
      .innerJoin(oauthGrant, eq(oauthGrant.connectionId, connectionGrant.connectionId))
      .where(and(inArray(connectionGrant.instanceId, instanceIds), isNull(connection.deletedAt), isNull(oauthGrant.revokedAt)))
      .groupBy(connectionGrant.instanceId),
  ]);
  for (const r of u) urls.set(r.id, r.n);
  for (const r of p) people.set(r.id, r.n);
  return { urls, people };
}

// Dokploy's own update check: the newest release it would install. Kept in
// memory for a while per instance, so the page doesn't ask on every load.
const LATEST_TTL_MS = 30 * 60_000;
const latestCache = new Map<string, { at: number; latest: string | null }>();

async function dokployLatest(baseUrl: string, apiKey: string): Promise<string | null> {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) return null;
  const res = await fetch(`${base}/api/settings.getUpdateData`, {
    method: "POST",
    headers: { "x-api-key": apiKey, accept: "application/json", "content-type": "application/json" },
    body: "{}",
    redirect: "manual",
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { latestVersion?: unknown };
  return typeof body?.latestVersion === "string" ? body.latestVersion : null;
}

export type Freshness = { status: string | null; version: string | null; latest: string | null };

type InstanceRow = {
  id: string;
  baseUrl: string;
  credential: typeof instance.$inferSelect.credential;
  lastStatus: string | null;
  lastVersion: string | null;
  lastValidatedAt: Date | null;
  specVersion?: string | null;
  specCheckedAt?: Date | null;
};

// Re-checks Dokploy instances whose last check is older than STALE_MS (the
// stored version went stale before: the page showed v0.29.13 while the
// server ran v0.31.2), and asks each for its latest release. Never holds
// the page longer than BUDGET_MS: anything slower renders from what's
// stored and finishes in the background.
const STALE_MS = 10 * 60_000;
// The instance's own API document is large (over a megabyte for Dokploy), so
// it's read again only every few hours, or as soon as the version changes.
const SPEC_STALE_MS = 6 * 60 * 60_000;
const BUDGET_MS = 3_000;

export async function freshDokploy(rows: InstanceRow[]): Promise<Map<string, Freshness>> {
  const out = new Map<string, Freshness>(
    rows.map((r) => [r.id, { status: r.lastStatus, version: r.lastVersion, latest: latestCache.get(r.id)?.latest ?? null }]),
  );
  const now = Date.now();
  const jobs = rows.map(async (r) => {
    const key = decryptCredential(r.credential);
    const stale = !r.lastValidatedAt || now - r.lastValidatedAt.getTime() > STALE_MS;
    const cached = latestCache.get(r.id);
    const [check, latest] = await Promise.all([
      stale ? testDokployConnection(r.baseUrl, key).catch(() => null) : Promise.resolve(null),
      cached && now - cached.at < LATEST_TTL_MS ? Promise.resolve(cached.latest) : dokployLatest(r.baseUrl, key).catch(() => null),
    ]);
    if (!cached || now - cached.at >= LATEST_TTL_MS) latestCache.set(r.id, { at: Date.now(), latest });
    const f = out.get(r.id)!;
    f.latest = latest;
    if (check) {
      const status = check.status === "bad_url" ? "unreachable" : check.status;
      f.status = status;
      if (check.version) f.version = check.version;
      await db
        .update(instance)
        .set({ lastValidatedAt: new Date(), lastStatus: status, lastVersion: check.version ?? r.lastVersion })
        .where(eq(instance.id, r.id));
    }
    const version = f.version;
    const specStale = !r.specCheckedAt || now - r.specCheckedAt.getTime() > SPEC_STALE_MS || (version && r.specVersion !== version);
    if (specStale && f.status === "ok") {
      const spec = await fetchDokploySpec(normalizeBaseUrl(r.baseUrl) ?? r.baseUrl, key).catch(() => null);
      if (spec) {
        await db
          .update(instance)
          .set({ specOps: spec.ops, specVersion: version ?? spec.version, specCheckedAt: new Date() })
          .where(eq(instance.id, r.id));
      }
    }
  });
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, BUDGET_MS))]);
  return out;
}
