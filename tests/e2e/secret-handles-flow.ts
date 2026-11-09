// End to end: an agent creates a database and wires its connection URL
// into an app without ever seeing the password. A real Postgres, the real
// MCP handler and a stand-in Dokploy that records what it was sent.
// Not part of `pnpm test`. Run it with
//   pnpm exec tsx tests/e2e/secret-handles-flow.ts
// It exits 0 when every check passes and 1 on the first failure.

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54333;
const DOKPLOY_PORT = 4556;

// What the stand-in Dokploy received, by path.
const received: Record<string, Record<string, unknown>[]> = {};
let dbPassword = "";

function fakeDokploy() {
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(body));
      };
      if (req.headers["x-api-key"] !== "dokploy-test-key") return send(401, { message: "Unauthorized" });
      const body = raw ? JSON.parse(raw) : Object.fromEntries(url.searchParams);
      (received[url.pathname] ??= []).push(body);
      switch (url.pathname) {
        case "/api/postgres.create":
          dbPassword = String(body.databasePassword);
          return send(200, { postgresId: "pg_1", appName: "zeqqat-db-x1" });
        case "/api/postgres.one":
          return send(200, {
            postgresId: "pg_1",
            appName: "zeqqat-db-x1",
            databaseName: "zeqqat",
            databaseUser: "zeqqat",
            databasePassword: dbPassword,
          });
        case "/api/application.saveEnvironment":
        case "/api/application.update":
          return send(200, true);
        default:
          return send(404, { message: "Not found" });
      }
    });
  }).listen(DOKPLOY_PORT);
}

let failures = 0;
function check(label: string, ok: boolean) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

async function main() {
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-secrets-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");
  Object.assign(process.env, {
    DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
    ZEQQAT_PUBLIC_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    ZEQQAT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ENABLED_AUTH_PROVIDERS: "google",
    GOOGLE_CLIENT_ID: "e2e",
    GOOGLE_CLIENT_SECRET: "e2e",
  });
  const fake = fakeDokploy();
  let closePool = async () => {};

  try {
    const { db } = await import("../../db");
    closePool = async () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    const schema = await import("../../db/schema");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });
    const { syncOfficialCatalog } = await import("../../lib/official-catalog");
    const { auth } = await import("../../lib/auth");
    const { listUserWorkspaces } = await import("../../lib/workspace");
    const { encryptCredential } = await import("../../lib/crypto");
    const { primaryConnection, addInstanceToPrimaryConnection } = await import("../../lib/connections");
    const { newId } = await import("../../lib/id");
    const { serveMcp } = await import("../../lib/mcp-server");
    const { eq } = await import("drizzle-orm");

    const ctxAuth = await auth.$context;
    const user = await ctxAuth.internalAdapter.createUser({ name: "Test User", email: "test@example.com", emailVerified: true }, { method: "admin" });
    await syncOfficialCatalog();
    const [ws] = await listUserWorkspaces(user.id);
    const [dokploy] = await db.select().from(schema.integration).where(eq(schema.integration.slug, "dokploy")).limit(1);
    const conn = await primaryConnection(ws, user.id);

    async function addInstance(alias: string) {
      const id = newId();
      await db.insert(schema.instance).values({
        id,
        workspaceId: ws.workspaceId,
        integrationId: dokploy.id,
        alias,
        baseUrl: `http://localhost:${DOKPLOY_PORT}/api`,
        credential: encryptCredential("dokploy-test-key"),
        lastStatus: "ok",
      });
      await addInstanceToPrimaryConnection(ws.workspaceId, id);
    }
    await addInstance("production");
    await addInstance("staging");

    const ctx = {
      organizationId: ws.organizationId,
      workspaceId: ws.workspaceId,
      organizationSlug: ws.organizationSlug,
      organizationKind: "personal" as const,
      workspaceName: ws.workspaceName,
      oauthClientId: null,
      userId: user.id,
      connectionId: conn.id,
      connectionName: conn.name,
      callerRole: "admin" as const,
    };
    const reason = "Create a database for My App and connect it";
    let rpc = 0;
    async function tool(name: string, args: Record<string, unknown>) {
      const req = new Request("http://localhost/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpc, method: "tools/call", params: { name, arguments: { reason, ...args } } }),
      });
      const body = await (await serveMcp(req, ctx, `flow-${rpc}`)).json();
      const result = body.result as { isError?: boolean; content: { text: string }[]; structuredContent?: { result?: unknown } };
      return { ...result, all: JSON.stringify(result) };
    }
    const run = (name: string, inputs: Record<string, unknown>, instance = "production") =>
      tool("zeqqat_run", { name, instance, inputs });
    const HANDLE = /\{\{zq_secret_[a-z0-9]{16}\}\}/;

    // 1. Mint a password.
    const minted = await tool("zeqqat_secret", { kind: "password", length: 32 });
    const handle = (minted.structuredContent?.result as { handle: string }).handle;
    check("zeqqat_secret returns a handle", HANDLE.test(handle ?? ""));

    // 2. Create the database with it.
    const created = await run("postgres.create", {
      name: "zeqqat-db",
      databaseName: "zeqqat",
      databaseUser: "zeqqat",
      databasePassword: handle,
      environmentId: "env_1",
    });
    check("postgres.create succeeds", !created.isError);
    check("Dokploy received a real 32-character password", /^[A-Za-z0-9]{32}$/.test(dbPassword));

    // 3. Read it back: the password comes back as a handle, never the value.
    const read = await run("postgres.one", { postgresId: "pg_1" });
    const readHandle = (read.structuredContent?.result as { databasePassword: string }).databasePassword;
    check("postgres.one shows the password as a handle", HANDLE.test(readHandle ?? ""));
    check("postgres.one never shows the value", !read.all.includes(dbPassword));

    // 4. Wire DATABASE_URL into the app, using the handle inside a string.
    const env = `NODE_ENV=production\nDATABASE_URL=postgresql://zeqqat:${readHandle}@zeqqat-db-x1:5432/zeqqat`;
    const saved = await run("application.saveEnvironment", {
      applicationId: "app_1",
      env,
      buildArgs: null,
      buildSecrets: null,
      createEnvFile: true,
    });
    check("saveEnvironment succeeds", !saved.isError);
    const sentEnv = String(received["/api/application.saveEnvironment"]?.[0]?.env ?? "");
    check("Dokploy received the real DATABASE_URL", sentEnv.includes(`postgresql://zeqqat:${dbPassword}@zeqqat-db-x1:5432/zeqqat`));
    check("saveEnvironment result never shows the value", !saved.all.includes(dbPassword));
    check("saveEnvironment result says the secret was filled in", saved.all.includes(`Filled in 1 secret before sending (${readHandle})`));
    const plain = await run("postgres.one", { postgresId: "pg_1" });
    check("a call without handles says nothing about filling in", !plain.all.includes("Filled in"));

    // 5. A handle in a field that could send it elsewhere is refused.
    const before = (received["/api/application.update"] ?? []).length;
    const misplaced = await run("application.update", { applicationId: "app_1", description: `pw ${handle}` });
    check("handle in a description is refused", misplaced.isError === true);
    check("nothing was sent for the refused call", (received["/api/application.update"] ?? []).length === before);

    // 6. A handle is bound to one instance.
    const otherInstance = await run("application.saveEnvironment", {
      applicationId: "app_2",
      env: `SECRET=${handle}`,
      buildArgs: null,
      buildSecrets: null,
      createEnvFile: true,
    }, "staging");
    check("handle from production is refused on staging", otherInstance.isError === true);

    // 7. Nothing Zeqqat stored carries the value in plain text.
    const logs = JSON.stringify(await db.select().from(schema.callLog));
    check("the call log never contains the value", !logs.includes(dbPassword));
    check("the call log keeps the handles", logs.includes(readHandle));
    const handles = JSON.stringify(await db.select().from(schema.secretHandle));
    check("stored handles hold only ciphertext", !handles.includes(dbPassword));

    // 8. Expired handles stop working and are deleted.
    await db.update(schema.secretHandle).set({ expiresAt: new Date(Date.now() - 1000) });
    const expired = await run("application.saveEnvironment", {
      applicationId: "app_1",
      env: `X=${readHandle}`,
      buildArgs: null,
      buildSecrets: null,
      createEnvFile: true,
    });
    check("an expired handle is refused", expired.isError === true);
    check("expired handles are deleted", (await db.select().from(schema.secretHandle)).length === 0);
  } finally {
    fake.close();
    await closePool().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
