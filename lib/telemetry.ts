// Anonymous install telemetry: how many self-hosted installs are running,
// and on which versions. Nothing else.
//
// A self-hosted install sends one small ping when it starts and once a day
// after that: { installId, version }. installId is a random UUID made on
// first start (install_identity); it identifies the install, not a person.
// No IP address, hostname, user, email, instance, connection or call data
// is ever sent, and the receiver stores no IP either.
//
// Turn it off with ZEQQAT_TELEMETRY=0 (or DO_NOT_TRACK=1). The hosted
// zeqqat.com never sends pings; it is the one that receives them.

import { asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { installIdentity } from "../db/schema";
import { newId } from "./id";
import { APP_VERSION } from "./version";

export const DEFAULT_TELEMETRY_URL = "https://zeqqat.com/api/telemetry";
export const PING_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PING_TIMEOUT_MS = 5_000;

// Exactly what a ping may contain. The receiver rejects anything else.
export const pingSchema = z
  .object({
    installId: z.uuid(),
    version: z.string().regex(/^[0-9A-Za-z.+-]{1,32}$/),
  })
  .strict();

export type Ping = z.infer<typeof pingSchema>;

type Env = Record<string, string | undefined>;

const OFF = new Set(["0", "false", "off", "no"]);

// Whether this install should send pings. Off for the hosted edition (it
// receives them), outside production (dev servers and tests), without a
// database (nowhere to keep the install id), and when the operator opted out.
export function telemetryEnabled(env: Env = process.env): boolean {
  if (OFF.has((env.ZEQQAT_TELEMETRY ?? "").trim().toLowerCase())) return false;
  if ((env.DO_NOT_TRACK ?? "").trim() === "1") return false;
  if (env.ZEQQAT_EDITION === "cloud") return false;
  if (env.NODE_ENV !== "production") return false;
  if (!env.DATABASE_URL) return false;
  return true;
}

export function telemetryUrl(env: Env = process.env): string {
  return env.ZEQQAT_TELEMETRY_URL?.trim() || DEFAULT_TELEMETRY_URL;
}

// The install's id: the oldest row, created on first start. Concurrent
// replicas may each insert one; every replica then reads the same oldest row.
async function installId(): Promise<string> {
  const [existing] = await db.select({ id: installIdentity.id }).from(installIdentity).orderBy(asc(installIdentity.createdAt)).limit(1);
  if (existing) return existing.id;
  await db.insert(installIdentity).values({ id: newId() }).onConflictDoNothing();
  const [row] = await db.select({ id: installIdentity.id }).from(installIdentity).orderBy(asc(installIdentity.createdAt)).limit(1);
  return row.id;
}

async function sendPing(url: string, ping: Ping): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ping),
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    });
  } catch {
    // Offline, blocked or zeqqat.com down: never the install's problem.
  }
}

let started = false;

// Called once on server start (instrumentation.ts), after migrations.
// Never throws and never delays startup.
export async function startTelemetry(): Promise<void> {
  if (started || !telemetryEnabled()) return;
  started = true;
  try {
    const ping: Ping = { installId: await installId(), version: APP_VERSION };
    const url = telemetryUrl();
    console.log("[zeqqat] sending an anonymous daily install ping (id and version only). Set ZEQQAT_TELEMETRY=0 to turn it off.");
    void sendPing(url, ping);
    setInterval(() => void sendPing(url, ping), PING_INTERVAL_MS).unref();
  } catch (err) {
    console.error("[zeqqat] install telemetry could not start:", err);
  }
}
