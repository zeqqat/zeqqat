import { lt, sql } from "drizzle-orm";
import { db } from "../db";
import { rateLimitBucket } from "../db/schema";

// One atomic upsert per check: the insert either creates this window's row
// or increments it, and returns the post-increment count. No read-then-write
// race, so two replicas hitting the same key at once can't both see "under
// the limit" and let a request through.
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  try {
    const [row] = await db
      .insert(rateLimitBucket)
      .values({ key, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitBucket.key, rateLimitBucket.windowStart],
        set: { count: sql`${rateLimitBucket.count} + 1` },
      })
      .returning({ count: rateLimitBucket.count });

    if (Math.random() < 0.01) await sweep(windowMs);

    return (row?.count ?? 1) <= limit;
  } catch {
    // A limiter that can't reach the database must not take the endpoint
    // down with it — the endpoints it guards do their own authentication.
    return true;
  }
}

// Expired windows are dead weight; clear them on roughly one call in a
// hundred rather than running a scheduler for one table.
async function sweep(windowMs: number) {
  const cutoff = new Date(Date.now() - Math.max(windowMs, 60_000) * 10);
  await db.delete(rateLimitBucket).where(lt(rateLimitBucket.windowStart, cutoff));
}

// Takes Headers directly rather than a Request so it works from both route
// handlers (`clientIp(request.headers)`) and server components, which only
// get a Headers object back from next/headers' `headers()`.
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() ?? "unknown";
}
