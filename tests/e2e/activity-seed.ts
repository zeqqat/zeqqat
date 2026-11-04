// A local, throwaway run of the Activity flow, end to end: a real Postgres,
// the real MCP handler, a stand-in Dokploy on localhost, then the app
// itself. Not part of `pnpm test`. Run it with
//   pnpm exec tsx tests/e2e/activity-seed.ts
// It prints the URLs to look at and keeps the app running until killed.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54331;
const APP_PORT = 3200;
const DOKPLOY_PORT = 4555;
const STATE = join(__dirname, ".auth", "activity-state.json");

function fakeDokploy() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, body: unknown, delay = 0) =>
      setTimeout(() => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      }, delay);
    if (req.headers["x-api-key"] !== "dokploy-test-key") return send(401, { message: "Unauthorized" });
    switch (url.pathname) {
      case "/api/application.one":
        return send(200, {
          applicationId: url.searchParams.get("applicationId"),
          name: "My App",
          appName: "my-app-4f2a",
          applicationStatus: "done",
          env: "NODE_ENV=production\nDATABASE_URL=postgres://app:s3cr3t-pa55@db:5432/app",
          githubToken: "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB",
          replicas: 1,
        }, 120);
      case "/api/deployment.all":
        return send(200, [
          { deploymentId: "dp_41", status: "error", title: "Rebuild" },
          { deploymentId: "dp_40", status: "done", title: "Deploy" },
        ], 80);
      case "/api/application.redeploy":
        return send(200, { success: true }, 900);
      case "/api/project.all":
        return send(401, { message: "Unauthorized" });
      default:
        return send(404, { message: "Not found" });
    }
  }).listen(DOKPLOY_PORT);
}

async function main() {
  // initdb may run as another user (embedded-postgres drops root), so the
  // parent is world-writable and initdb creates the data dir itself.
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-activity-pg-"));
  chmodSync(parent, 0o777);
  const dataDir = join(parent, "data");
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  const env = {
    DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
    ZEQQAT_PUBLIC_URL: `http://localhost:${APP_PORT}`,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    ZEQQAT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ENABLED_AUTH_PROVIDERS: "google",
    GOOGLE_CLIENT_ID: "e2e",
    GOOGLE_CLIENT_SECRET: "e2e",
  };
  Object.assign(process.env, env);
  const fake = fakeDokploy();

  const stop = async () => {
    fake.close();
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const { db } = await import("../../db");
  const schema = await import("../../db/schema");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });

  const { syncOfficialCatalog } = await import("../../lib/official-catalog");
  const { auth } = await import("../../lib/auth");
  const { makeSignature } = await import("better-auth/crypto");
  const { listUserWorkspaces } = await import("../../lib/workspace");
  const { encryptCredential } = await import("../../lib/crypto");
  const { primaryConnection, addInstanceToPrimaryConnection } = await import("../../lib/connections");
  const { newId } = await import("../../lib/id");
  const { serveMcp } = await import("../../lib/mcp-server");
  const { eq, and } = await import("drizzle-orm");

  // Signed-in user, the same way tests/e2e/server.ts does it.
  const ctxAuth = await auth.$context;
  const user = await ctxAuth.internalAdapter.createUser({ name: "Perminus Gaita", email: "gaita@example.com", emailVerified: true }, { method: "admin" });
  const session = await ctxAuth.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, ctxAuth.secret);
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(
    STATE,
    JSON.stringify({
      cookies: [
        {
          name: ctxAuth.authCookies.sessionToken.name,
          value: encodeURIComponent(`${session.token}.${signature}`),
          domain: "localhost",
          path: "/",
          expires: Math.floor(session.expiresAt.getTime() / 1000),
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );

  // The official Dokploy catalog has to belong to someone.
  await syncOfficialCatalog();
  const [ws] = await listUserWorkspaces(user.id);
  const [dokploy] = await db.select().from(schema.integration).where(eq(schema.integration.slug, "dokploy")).limit(1);

  const conn = await primaryConnection(ws, user.id);
  const instanceId = newId();
  await db.insert(schema.instance).values({
    id: instanceId,
    workspaceId: ws.workspaceId,
    integrationId: dokploy.id,
    alias: "dokploy-production",
    baseUrl: `http://localhost:${DOKPLOY_PORT}/api`,
    credential: encryptCredential("dokploy-test-key"),
    lastStatus: "ok",
  });
  await addInstanceToPrimaryConnection(ws.workspaceId, instanceId);
  const stagingId = newId();
  await db.insert(schema.instance).values({
    id: stagingId,
    workspaceId: ws.workspaceId,
    integrationId: dokploy.id,
    alias: "dokploy-staging",
    baseUrl: `http://localhost:${DOKPLOY_PORT}/api`,
    credential: encryptCredential("wrong-key"),
    lastStatus: "bad_key",
  });
  await addInstanceToPrimaryConnection(ws.workspaceId, stagingId);

  const clientId = newId();
  await db.insert(schema.oauthClient).values({
    id: clientId,
    clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
  await db.insert(schema.oauthGrant).values({
    id: newId(),
    oauthClientId: clientId,
    userId: user.id,
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    connectionId: conn.id,
    scope: "mcp",
  });

  const ctx = {
    organizationId: ws.organizationId,
    workspaceId: ws.workspaceId,
    organizationSlug: ws.organizationSlug,
    organizationKind: "personal" as const,
    workspaceName: ws.workspaceName,
    oauthClientId: clientId,
    userId: user.id,
    connectionId: conn.id,
    connectionName: conn.name,
    callerRole: "admin" as const,
  };
  let rpc = 0;
  async function tool(name: string, args: Record<string, unknown>) {
    const req = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: args } }),
    });
    const res = await serveMcp(req, ctx, `seed-${rpc}`);
    const body = await res.json();
    return body.result as { isError?: boolean; content: { text: string }[] };
  }

  const count = async () => (await db.select({ id: schema.callLog.id }).from(schema.callLog)).length;

  // No reason: refused, and nothing logged.
  const before = await count();
  const refused = await tool("zeqqat_run", { name: "application.one", instance: "dokploy-production", inputs: { applicationId: "x" } });
  if (!refused.isError || !refused.content[1].text.startsWith("reason is required")) throw new Error("a call without a reason was not refused");
  if ((await count()) !== before) throw new Error("a refused call was logged");

  const R1 = "My App is returning 502s, find out why and fix it";
  await tool("zeqqat_search", { query: "application", reason: R1 });
  await tool("zeqqat_describe", { name: "application.one", reason: R1 });
  await tool("zeqqat_run", { name: "application.one", instance: "dokploy-production", inputs: { applicationId: "kq3Vx9_mT2" }, reason: R1 });
  await tool("zeqqat_run", { name: "deployment.all", instance: "dokploy-production", inputs: { applicationId: "kq3Vx9_mT2" }, reason: R1 });
  const blocked = await tool("zeqqat_run", { name: "application.delete", instance: "dokploy-production", inputs: { applicationId: "kq3Vx9_mT2" }, reason: R1 });
  if (!blocked.isError) throw new Error("delete was not blocked");
  await tool("zeqqat_search", { query: "redeploy", reason: R1 });
  await tool("zeqqat_run", { name: "application.redeploy", instance: "dokploy-production", inputs: { applicationId: "kq3Vx9_mT2" }, reason: R1 });

  const R2 = "Check which services are running on staging";
  await tool("zeqqat_run", { name: "project.all", instance: "dokploy-staging", inputs: {}, reason: R2 });

  const rows = await db.select().from(schema.callLog);
  const requests = await db.select().from(schema.agentRequest);
  const run = rows.find((r) => r.toolName.endsWith("application_one"))!;
  if (requests.length !== 2) throw new Error(`expected 2 requests, got ${requests.length}`);
  if (rows.some((r) => r.outcome === "running")) throw new Error("a call was left running");
  if (!run.outboundRequest || JSON.stringify(run.outboundRequest).includes("dokploy-test-key")) throw new Error("outbound request missing or leaked the key");
  if (JSON.stringify(run.responseBody).includes("s3cr3t-pa55")) throw new Error("a secret reached the log");
  if (run.instanceAlias !== "dokploy-production" || run.callerRole !== "admin") throw new Error("call setting not recorded");

  const r1 = requests.find((r) => r.reason === R1)!;
  const [first] = await db.select().from(schema.callLog).where(and(eq(schema.callLog.requestId, r1.id), eq(schema.callLog.toolName, run.toolName)));
  console.log(
    JSON.stringify({
      ok: true,
      calls: rows.length,
      requests: requests.length,
      urls: [`/app`, `/app/activity`, `/app/activity/${r1.id}`, `/app/activity/call/${first.id}`],
    }),
  );

  const app = spawn("pnpm", ["exec", "next", "dev", "-p", String(APP_PORT)], {
    stdio: "inherit",
    env: { ...process.env, ...env, PORT: String(APP_PORT), HOSTNAME: "localhost", ZEQQAT_CATALOG_SYNC: "0" },
  });
  app.on("exit", () => void stop());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
