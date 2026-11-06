// The whole install-ping loop against a throwaway Postgres, no Next server:
// a "self-hosted" startTelemetry() pings a local HTTP server that hands the
// request to the real /api/telemetry handler running as the hosted edition.
//
//   pnpm exec tsx tests/e2e/telemetry-flow.ts

import { createServer } from "node:http";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54331;
const HTTP_PORT = 54332;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  // initdb creates the data folder itself, so it owns it even when this
  // runs as root (initdb then runs as another user).
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-telemetry-pg-"));
  chmodSync(parent, 0o777);
  const dataDir = join(parent, "data");
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  const server = createServer();
  let closePool = async () => {};
  try {
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
      ZEQQAT_PUBLIC_URL: "http://localhost:3000",
      NODE_ENV: "production",
      ZEQQAT_TELEMETRY_URL: `http://localhost:${HTTP_PORT}/api/telemetry`,
    });

    const { db } = await import("../../db");
    const pool = (db as unknown as { $client: { end(): Promise<void>; on(e: string, f: () => void): void } }).$client;
    pool.on("error", () => {}); // Postgres stopping at the end is expected
    closePool = () => pool.end();
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });
    const { installIdentity, telemetryInstall } = await import("../../db/schema");
    const { POST } = await import("../../app/api/telemetry/route");
    const { startTelemetry } = await import("../../lib/telemetry");
    const { APP_VERSION } = await import("../../lib/version");

    // The receiver: plain node http in front of the real route handler.
    // The handler reads ZEQQAT_EDITION per request, so it runs as cloud here.
    let received = 0;
    server.on("request", async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      process.env.ZEQQAT_EDITION = "cloud";
      const out = await POST(new Request(`http://localhost${req.url}`, { method: "POST", body: Buffer.concat(chunks) }));
      delete process.env.ZEQQAT_EDITION;
      received++;
      res.writeHead(out.status).end();
    });
    await new Promise<void>((r) => server.listen(HTTP_PORT, r));

    // A self-hosted edition answers 404 and stores nothing.
    const selfHosted = await POST(new Request("http://x/api/telemetry", { method: "POST", body: "{}" }));
    assert(selfHosted.status === 404, "a self-hosted install refuses pings");

    process.env.ZEQQAT_EDITION = "cloud";
    const bad = await POST(new Request("http://x/api/telemetry", { method: "POST", body: JSON.stringify({ installId: "x", version: "1", email: "a@b.c" }) }));
    assert(bad.status === 400, "the receiver rejects anything but { installId, version }");
    delete process.env.ZEQQAT_EDITION;

    await startTelemetry();
    for (let i = 0; i < 50 && received === 0; i++) await new Promise((r) => setTimeout(r, 100));
    assert(received === 1, "startTelemetry sends one ping on start");

    const ids = await db.select().from(installIdentity);
    assert(ids.length === 1, "the install got one anonymous id");
    const rows = await db.select().from(telemetryInstall);
    assert(rows.length === 1 && rows[0].installId === ids[0].id, "the receiver stored that install");
    assert(rows[0].version === APP_VERSION && rows[0].pingCount === 1, `version ${APP_VERSION}, one ping`);

    // A second ping from the same install updates the row, not a new one.
    process.env.ZEQQAT_EDITION = "cloud";
    await POST(new Request("http://x/api/telemetry", { method: "POST", body: JSON.stringify({ installId: ids[0].id, version: "9.9.9" }) }));
    delete process.env.ZEQQAT_EDITION;
    const after = await db.select().from(telemetryInstall);
    assert(after.length === 1 && after[0].pingCount === 2 && after[0].version === "9.9.9", "a repeat ping updates the same install");

    // The Operator page's queries run and count this install.
    const { operatorStats } = await import("../../lib/operator");
    const stats = await operatorStats();
    assert(stats.installs.total === 1 && stats.installs.active7 === 1, "operator stats count the install as active");
    assert(stats.signupsDaily.length === 30 && stats.users.total === 0, "operator stats return 30 days of sign-ups");

    console.log("\nall telemetry checks passed");
  } finally {
    server.close();
    await closePool().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
