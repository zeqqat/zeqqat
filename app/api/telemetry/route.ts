import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { telemetryInstall } from "../../../db/schema";
import { edition } from "../../../lib/edition";
import { rateLimit } from "../../../lib/rate-limit";
import { pingSchema } from "../../../lib/telemetry";

// Receives install pings (lib/telemetry.ts). Only the hosted zeqqat.com
// accepts them; a self-hosted install answers 404. Stores the install id,
// version and when it was seen. No IP address is stored, and the rate
// limit is keyed on the install id for that reason.

const MAX_BODY = 1024;

export async function POST(request: Request) {
  if (edition() !== "cloud") return new Response(null, { status: 404 });

  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = pingSchema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { installId, version } = parsed.data;

  if (!(await rateLimit(`telemetry:${installId}`, 10, 60 * 60 * 1000))) {
    return new Response(null, { status: 429 });
  }

  await db
    .insert(telemetryInstall)
    .values({ installId, version })
    .onConflictDoUpdate({
      target: telemetryInstall.installId,
      set: {
        version,
        lastSeenAt: sql`now()`,
        pingCount: sql`${telemetryInstall.pingCount} + 1`,
      },
    });

  return new Response(null, { status: 204 });
}
