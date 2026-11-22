// zeqqat.com's side of an install it made (lib/selfhost-installs.ts),
// against a throwaway Postgres: the claim link is saved and shown until the
// install reports its claim, wrong tokens change nothing, and the Self-host
// menu item stays until 7 days after the claim.
//
//   pnpm exec tsx tests/e2e/selfhost-saved-flow.ts

import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54338;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-saved-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");
  let closePool = async () => {};
  try {
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
      ZEQQAT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      ZEQQAT_EDITION: "cloud",
    });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    closePool = async () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });
    const { encryptCredential } = await import("../../lib/crypto");
    const { claimHash } = await import("../../lib/selfhost-seed");
    const { installsOf, recordClaim, showSelfHostMenu } = await import("../../lib/selfhost-installs");
    const { newId } = await import("../../lib/id");

    const userId = newId();
    await db.insert(schema.user).values({ id: userId, name: "Gaita", email: "gaita@example.com", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    const orgId = newId();
    await db.insert(schema.organization).values({ id: orgId, slug: "gaita", displayName: "Gaita", kind: "personal", ownerUserId: userId });

    assert(!(await showSelfHostMenu(orgId)), "no install: no Self-host in the menu");

    const token = randomBytes(32).toString("base64url");
    const id = newId();
    await db.insert(schema.selfhostInstall).values({
      id,
      organizationId: orgId,
      composeId: "c1",
      address: "https://zeqqat-ab12cd-1-2-3-4.sslip.io",
      claimHash: claimHash(token),
      claimToken: encryptCredential(token),
      ownKey: true,
      createdByUserId: userId,
    });
    let [one] = await installsOf(orgId);
    assert(one.claimUrl === `https://zeqqat-ab12cd-1-2-3-4.sslip.io/claim/${token}`, "the claim link is saved and shown again");
    assert(await showSelfHostMenu(orgId), "not claimed: Self-host is in the menu");

    await recordClaim("wrong");
    [one] = await installsOf(orgId);
    assert(one.claimedAt === null, "a wrong token changes nothing");

    await recordClaim(token);
    [one] = await installsOf(orgId);
    assert(one.claimedAt !== null && one.claimUrl === null, "claimed: the link is gone");
    assert(await showSelfHostMenu(orgId), "claimed today: still in the menu");

    await db.update(schema.selfhostInstall).set({ claimedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(schema.selfhostInstall.id, id));
    assert(!(await showSelfHostMenu(orgId)), "claimed 8 days ago: only in Settings");

    const { POST } = await import("../../app/api/selfhost/claimed/route");
    const res = await POST(new Request("http://x/api/selfhost/claimed", { method: "POST", body: JSON.stringify({ token: "nope" }) }));
    assert(res.status === 204, "the report endpoint answers 204 whatever it gets");

    console.log("selfhost saved flow: ok");
  } finally {
    await closePool().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
