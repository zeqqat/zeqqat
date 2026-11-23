// A Zeqqat installed from zeqqat.com, claimed by its owner, through Better
// Auth's real API against a throwaway Postgres and a stand-in Dokploy:
// - with a seed, the first account can only be made with the claim token
//   and the seeded email (no token, wrong token, wrong email: refused)
// - claiming brings in the username, the workspace and the Dokploy
//   instance, so Setup is at step 3 (Connect your agent)
// - the seed is then removed from the compose's env in Dokploy
//
//   pnpm exec tsx tests/e2e/selfhost-claim-flow.ts

import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54337;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function refused(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const err = e as { body?: { code?: string }; message?: string };
    return err.body?.code ?? err.message ?? "error";
  }
}

async function main() {
  // The stand-in Dokploy: holds the compose's env so the strip can be seen.
  const KEY = "zqself_abcdefghijklmnop1234";
  let composeEnv = "";
  let reported: string | null = null;
  let deployed = false;
  const dokploy = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const op = new URL(req.url ?? "/", "http://x").pathname.replace(/^\/api\//, "");
      const send = (s: number, d: unknown) => {
        res.writeHead(s, { "content-type": "application/json" });
        res.end(JSON.stringify(d));
      };
      // Stands in for zeqqat.com too: the claim report.
      if (req.url === "/api/selfhost/claimed") {
        reported = JSON.parse(raw).token;
        res.writeHead(204);
        return res.end();
      }
      if (req.headers["x-api-key"] !== KEY) return send(401, { message: "Unauthorized" });
      if (op === "compose.one") return send(200, { composeId: "c1", env: composeEnv });
      if (op === "domain.byComposeId")
        return send(200, [
          { host: "zeqqat-ab12-1-2-3-4.sslip.io", https: true, serviceName: "zeqqat" },
          { host: "zeqqat.example.com", https: true, serviceName: "zeqqat" },
        ]);
      if (op === "compose.deploy") {
        deployed = true;
        return send(200, true);
      }
      if (op === "compose.update") {
        composeEnv = JSON.parse(raw).env;
        return send(200, true);
      }
      return send(404, { message: `no ${op}` });
    });
  });
  await new Promise<void>((r) => dokploy.listen(0, "127.0.0.1", r));
  const dokployUrl = `http://127.0.0.1:${(dokploy.address() as AddressInfo).port}`;

  const parent = mkdtempSync(join(tmpdir(), "zeqqat-claim-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  let closePool = async () => {};
  try {
    const encryptionKey = randomBytes(32).toString("base64");
    delete process.env.ZEQQAT_EDITION;
    delete process.env.ENABLED_AUTH_PROVIDERS;
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
      ZEQQAT_PUBLIC_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
      ZEQQAT_ENCRYPTION_KEY: encryptionKey,
      ZEQQAT_TELEMETRY: "0",
    });

    // What zeqqat.com writes (lib/actions/selfhost.ts installConfigure).
    const { encryptCredential, decryptCredential } = await import("../../lib/crypto");
    const { claimHash, encodeSeed } = await import("../../lib/selfhost-seed");
    const token = randomBytes(32).toString("base64url");
    const seed = encodeSeed({
      v: 1,
      claim: claimHash(token),
      owner: { email: "gaita@example.com", name: "Gaita", username: "gaita" },
      instance: {
        alias: "production",
        baseUrl: dokployUrl,
        credential: encryptCredential(KEY, encryptionKey),
        keyHint: { start: "zqself_", end: "1234" },
        lastVersion: "v0.25.6",
      },
      workspaces: [{ slug: "production", name: "production" }],
      composeId: "c1",
      report: dokployUrl,
      cloudKey: { start: "zeqqat_", end: "k4Qz" },
      cloudHost: "zeqqat.com",
    });
    process.env.ZEQQAT_SEED = seed;
    composeEnv = `ZEQQAT_PUBLIC_URL=https://x.sslip.io\nZEQQAT_SEED=${seed}\nPOSTGRES_PASSWORD=abc`;

    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    closePool = async () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });
    const { syncOfficialCatalog } = await import("../../lib/official-catalog");
    await syncOfficialCatalog();

    const { auth } = await import("../../lib/auth");
    const { awaitingClaim } = await import("../../lib/seed-claim");
    assert(await awaitingClaim(), "a fresh install with a seed waits to be claimed");

    // Opened on a domain the owner added in Dokploy: sign-up is allowed
    // there, on no other host.
    const { claimOrigin } = await import("../../lib/own-domains");
    const there = new Headers({ "x-forwarded-proto": "https", host: "zeqqat.example.com" });
    assert((await claimOrigin(there)) === "https://zeqqat.example.com", "a domain added in Dokploy is this install's own");
    assert((await claimOrigin(new Headers({ "x-forwarded-proto": "https", host: "evil.example.com" }))) === null, "any other host is not");

    const body = { name: "Gaita", email: "gaita@example.com", password: "correct-horse-1" };
    assert((await refused(auth.api.signUpEmail({ body }))) === "signups_closed", "no claim token: refused");
    assert(
      (await refused(auth.api.signUpEmail({ body, headers: new Headers({ "x-zeqqat-claim": "wrong" }) }))) === "signups_closed",
      "a wrong claim token: refused",
    );
    assert(
      (await refused(
        auth.api.signUpEmail({ body: { ...body, email: "eve@example.com" }, headers: new Headers({ "x-zeqqat-claim": token }) }),
      )) === "signups_closed",
      "the right token with another email: refused",
    );

    const made = await auth.api.signUpEmail({
      body: { ...body, name: "gaita" },
      headers: new Headers({ "x-zeqqat-claim": token, "x-forwarded-proto": "https", host: "zeqqat.example.com" }),
    });
    assert(made.user?.id, "the claim link makes the owner account");
    assert(!(await awaitingClaim()), "claimed: no longer waiting");

    const [own] = await db.select().from(schema.organization).where(eq(schema.organization.ownerUserId, made.user.id));
    assert(own?.slug === "gaita", "their username came along (@gaita)");
    const insts = await db.select().from(schema.instance).where(eq(schema.instance.organizationId, own.id));
    assert(insts.length === 1 && insts[0].alias === "production", "the production instance came along");
    assert(decryptCredential(insts[0].credential) === KEY, "with its new key, readable by this install");
    const wss = await db.select().from(schema.workspace).where(eq(schema.workspace.organizationId, own.id));
    assert(wss.length === 1 && wss[0].slug === "production", "the workspace came along");
    const given = await db.select().from(schema.workspaceInstance).where(eq(schema.workspaceInstance.workspaceId, wss[0].id));
    assert(given.length === 1, "the workspace uses the instance");

    const { setupStep } = await import("../../lib/setup");
    assert((await setupStep(own.id)).step === 3, "Setup opens at Connect your agent");

    for (let i = 0; i < 50 && composeEnv.includes("ZEQQAT_SEED"); i++) await new Promise((r) => setTimeout(r, 100));
    assert(!composeEnv.includes("ZEQQAT_SEED") && composeEnv.includes("POSTGRES_PASSWORD=abc"), "the seed was taken out of the compose env");
    for (let i = 0; i < 50 && !deployed; i++) await new Promise((r) => setTimeout(r, 100));
    assert(composeEnv.includes("ZEQQAT_PUBLIC_URL=https://zeqqat.example.com") && !composeEnv.includes("x.sslip.io"), "the domain it was claimed on became its address");
    assert(deployed, "and it redeployed to use it");

    const [named] = await db.select().from(schema.user).where(eq(schema.user.id, made.user.id));
    assert(named.name === "Gaita", "the name came from zeqqat.com, not the form");
    const { pendingHandoff } = await import("../../lib/cloud-handoff");
    const pending = await pendingHandoff(made.user.id);
    assert(pending?.cloudHost === "zeqqat.com" && pending.hint?.end === "k4Qz", "the owner is asked about zeqqat.com's key first");

    for (let i = 0; i < 50 && !reported; i++) await new Promise((r) => setTimeout(r, 100));
    assert(reported === token, "zeqqat.com was told it's claimed, with only the claim token");

    assert(
      (await refused(auth.api.signUpEmail({ body: { ...body, email: "x@example.com" }, headers: new Headers({ "x-zeqqat-claim": token }) }))) ===
        "signups_closed",
      "the claim link can't make a second account",
    );

    console.log("selfhost claim flow: ok");
  } finally {
    await closePool().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
    dokploy.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
