// Who owns @zeqqat, per edition, against a throwaway Postgres:
// - self-hosted: a system org with no owner or members, created even before
//   anyone signs up; an install that gave it to its first user (before
//   v0.2.2) has that taken back.
// - cloud: owned by the oldest user, as before.
//
//   pnpm exec tsx tests/e2e/system-org-flow.ts

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54333;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  // initdb creates the data folder itself, so it owns it even when this
  // runs as root (initdb then runs as another user).
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-sysorg-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  for (const name of ["fresh", "legacy", "cloud"]) await pg.createDatabase(name);

  let closePool = async () => {};
  try {
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/fresh`,
      ZEQQAT_PUBLIC_URL: "http://localhost:3000",
    });
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    const { syncOfficialCatalog, OFFICIAL_ORG_SLUG } = await import("../../lib/official-catalog");
    const { newId } = await import("../../lib/id");

    // syncOfficialCatalog uses the app's db; point it at each database in turn
    // by swapping the pool behind it.
    const pools: { end(): Promise<void> }[] = [];
    const appPool = (db as unknown as { $client: { end(): Promise<void> } }).$client;
    pools.push(appPool);
    closePool = async () => {
      for (const p of pools) await p.end().catch(() => {});
    };
    async function connectTo(name: string) {
      const pool = new Pool({ connectionString: `postgresql://postgres:postgres@localhost:${PG_PORT}/${name}` });
      pool.on("error", () => {});
      pools.push(pool);
      const d = drizzle(pool, { schema });
      await migrate(d, { migrationsFolder: join(__dirname, "../../db/migrations") });
      Object.assign(db, d); // the app's db now talks to this database
      return d;
    }
    async function addUser(d: Awaited<ReturnType<typeof connectTo>>, email: string) {
      const id = newId();
      await d.insert(schema.user).values({ id, name: email, email });
      return id;
    }
    async function officialOrg(d: Awaited<ReturnType<typeof connectTo>>) {
      const [org] = await d.select().from(schema.organization).where(eq(schema.organization.slug, OFFICIAL_ORG_SLUG));
      const members = org ? await d.select().from(schema.membership).where(eq(schema.membership.organizationId, org.id)) : [];
      const [integ] = org ? await d.select().from(schema.integration).where(eq(schema.integration.organizationId, org.id)) : [];
      return { org, members, integ };
    }

    // 1. Fresh self-hosted install, nobody signed up yet.
    delete process.env.ZEQQAT_EDITION;
    const fresh = await connectTo("fresh");
    await syncOfficialCatalog();
    let o = await officialOrg(fresh);
    assert(o.org && o.org.ownerUserId === null && o.members.length === 0, "self-hosted: @zeqqat has no owner or members");
    assert(o.integ?.official, "self-hosted: the catalog imports before anyone signs up");
    await addUser(fresh, "first@example.com");
    await syncOfficialCatalog();
    o = await officialOrg(fresh);
    assert(o.org.ownerUserId === null && o.members.length === 0, "self-hosted: the first user does not get @zeqqat");

    // 2. Self-hosted install from before: @zeqqat owned by the first user.
    const legacy = await connectTo("legacy");
    const first = await addUser(legacy, "old@example.com");
    const orgId = newId();
    await legacy.insert(schema.organization).values({ id: orgId, slug: OFFICIAL_ORG_SLUG, displayName: "Zeqqat", kind: "organization", ownerUserId: first });
    const wsId = newId();
    await legacy.insert(schema.workspace).values({ id: wsId, organizationId: orgId, slug: "default", name: "Default" });
    await legacy.insert(schema.membership).values({ id: newId(), userId: first, organizationId: orgId, role: "owner" });
    await syncOfficialCatalog();
    o = await officialOrg(legacy);
    assert(o.org.ownerUserId === null && o.members.length === 0, "self-hosted upgrade: the first user's ownership is taken back");
    assert(o.integ?.official, "self-hosted upgrade: the catalog stays official");

    // 3. zeqqat.com: owned by the oldest user, as before.
    process.env.ZEQQAT_EDITION = "cloud";
    const cloud = await connectTo("cloud");
    const operator = await addUser(cloud, "operator@example.com");
    await syncOfficialCatalog();
    o = await officialOrg(cloud);
    assert(o.org.ownerUserId === operator && o.members.length === 1 && o.members[0].role === "owner", "cloud: the operator owns @zeqqat");

    console.log("\nall system org checks passed");
  } finally {
    await closePool();
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
    process.exit(process.exitCode ?? 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
