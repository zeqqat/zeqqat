// A local, throwaway look at the account level and the path switcher:
// your personal account with two workspaces, an organization you own with
// three, and one where you're a member of one workspace. Not part of
// `pnpm test`. Run it with
//   pnpm exec tsx tests/e2e/accounts-seed.ts
// It writes a signed-in session to tests/e2e/.auth/accounts-state.json,
// prints the URLs and keeps the app running until killed.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54332;
const APP_PORT = Number(process.env.APP_PORT ?? 3201);
const STATE = join(__dirname, ".auth", "accounts-state.json");

async function main() {
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-accounts-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
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
  const stop = async () => {
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
  const { listUserAccounts } = await import("../../lib/workspace");
  const { encryptCredential } = await import("../../lib/crypto");
  const { newId } = await import("../../lib/id");
  const { eq } = await import("drizzle-orm");

  const ctxAuth = await auth.$context;
  const mk = (name: string, email: string) => ctxAuth.internalAdapter.createUser({ name, email, emailVerified: true }, { method: "admin" });
  const me = await mk(process.env.SEED_NAME ?? "Gaita", process.env.SEED_EMAIL ?? "gaita@example.com");
  const wanjiru = await mk("Wanjiru K", "wanjiru@example.com");
  const otieno = await mk("Otieno", "otieno@example.com");
  const amina = await mk("Amina S", "amina@example.com");

  const session = await ctxAuth.internalAdapter.createSession(me.id);
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

  await syncOfficialCatalog();
  const [dokploy] = await db.select().from(schema.integration).where(eq(schema.integration.slug, "dokploy")).limit(1);

  async function ws(orgId: string, name: string) {
    const id = newId();
    await db.insert(schema.workspace).values({ id, organizationId: orgId, slug: name.toLowerCase().replace(/\W+/g, "-"), name, setupCompletedAt: new Date() });
    return id;
  }

  // Sign-up makes no workspace; the personal one is made here, as Setup would.
  const [mine] = await listUserAccounts(me.id);
  await db.update(schema.organization).set({ setupCompletedAt: new Date() }).where(eq(schema.organization.id, mine.organizationId));
  const personal = { organizationId: mine.organizationId, workspaceId: await ws(mine.organizationId, "Default") };
  async function org(slug: string, name: string, owner: string) {
    const id = newId();
    await db.insert(schema.organization).values({ id, slug, displayName: name, kind: "organization", ownerUserId: owner });
    await db.insert(schema.membership).values({ id: newId(), userId: owner, organizationId: id, role: "owner" });
    return id;
  }
  async function member(orgId: string, userId: string, wsIds: string[], role: "owner" | "member" = "member") {
    await db.insert(schema.membership).values({ id: newId(), userId, organizationId: orgId, role });
    for (const w of wsIds) await db.insert(schema.workspaceMember).values({ id: newId(), workspaceId: w, userId, role: "member" });
  }
  async function dokployIn(orgId: string, wsId: string, alias: string, calls: number) {
    const instanceId = newId();
    await db.insert(schema.instance).values({
      id: instanceId,
      organizationId: orgId,
      integrationId: dokploy.id,
      alias,
      baseUrl: "http://localhost:1/api",
      credential: encryptCredential("k"),
      lastStatus: "ok",
    });
    await db.insert(schema.workspaceInstance).values({ workspaceId: wsId, instanceId: instanceId });
    const connId = newId();
    await db.insert(schema.connection).values({ id: connId, organizationId: orgId, workspaceId: wsId, name: "deployment", shortId: randomBytes(3).toString("hex") });
    for (let i = 0; i < calls; i++) {
      await db.insert(schema.callLog).values({
        id: newId(),
        organizationId: orgId,
        workspaceId: wsId,
        connectionId: connId,
        instanceId,
        toolName: "@zeqqat/dokploy.http.application_one",
        outcome: "ok",
        durationMs: 120,
        createdAt: new Date(Date.now() - (i % 7) * 86_400_000 - i * 60_000),
      });
    }
  }

  // Personal: Default plus Side projects, with two people helping.
  await dokployIn(personal.organizationId, personal.workspaceId, "my-dokploy", 41);
  const side = await ws(personal.organizationId, "Side projects");
  await dokployIn(personal.organizationId, side, "side-dokploy", 6);
  await member(personal.organizationId, wanjiru.id, [personal.workspaceId]);
  await member(personal.organizationId, otieno.id, [personal.workspaceId]);

  // An organization you own, three workspaces.
  const acme = await org("acme_corp", "Acme Corp", me.id);
  const eng = await ws(acme, "Engineering");
  const mkt = await ws(acme, "Marketing");
  const cli = await ws(acme, "Client sites");
  await dokployIn(acme, eng, "production", 60);
  await dokployIn(acme, mkt, "marketing", 18);
  await dokployIn(acme, cli, "clients", 0);
  await member(acme, wanjiru.id, [eng, cli]);
  await member(acme, otieno.id, [eng]);

  // One where you're only a member of one workspace.
  const fans = await org("dokploy_fans", "Dokploy Fans", amina.id);
  const fansWs = await ws(fans, "Default");
  await dokployIn(fans, fansWs, "fans-dokploy", 9);
  await member(fans, me.id, [fansWs]);

  console.log(JSON.stringify({ ok: true, urls: ["/gaita", "/gaita/default", "/gaita/members", "/acme_corp/engineering"] }));

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
