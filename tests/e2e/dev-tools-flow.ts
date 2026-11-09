// Dev tools "Start over as a new user", against a throwaway Postgres:
// retiring a user frees its email and Google link (so the same Google
// account signs up as someone new), keeps every row, and switching back
// restores the original user.
//
//   pnpm exec tsx tests/e2e/dev-tools-flow.ts

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54337;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

async function main() {
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-devtools-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("devtools");

  let closePool = async () => {};
  try {
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/devtools`,
      ZEQQAT_PUBLIC_URL: "https://dev.zeqqat.test",
      ZEQQAT_DEV_TOOLS: "1",
    });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { and, eq } = await import("drizzle-orm");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    const { newId } = await import("../../lib/id");
    const { runSignupTransaction } = await import("../../lib/signup");
    const { pastUsersOf, retireUser, restoreUser } = await import("../../lib/dev-users");
    closePool = async () => {
      await (db as unknown as { $client: { end(): Promise<void> } }).$client.end().catch(() => {});
    };
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });

    const EMAIL = "tester@example.com";
    const GOOGLE_ID = "google-sub-123";

    // What a Google sign-in creates: a user, its namespace, a google link.
    async function googleSignUp(name: string) {
      const id = newId();
      await db.insert(schema.user).values({ id, name, email: EMAIL, emailVerified: true });
      await db.insert(schema.account).values({ id: newId(), userId: id, providerId: "google", accountId: GOOGLE_ID });
      await runSignupTransaction(id, name, EMAIL);
      return id;
    }
    // How Better Auth finds the user for a Google sign-in: by email, else
    // by the provider's account id.
    async function whoSignsIn() {
      const byEmail = await db.query.user.findFirst({ where: eq(schema.user.email, EMAIL) });
      if (byEmail) return byEmail.id;
      const link = await db.query.account.findFirst({
        where: and(eq(schema.account.providerId, "google"), eq(schema.account.accountId, GOOGLE_ID)),
      });
      return link?.userId ?? null;
    }

    const first = await googleSignUp("First");
    assert((await whoSignsIn()) === first, "before: Google signs in as the first user");

    await db.transaction((tx) => retireUser(tx, first));
    assert((await whoSignsIn()) === null, "after starting over: Google matches nobody, so the next sign-in is a new user");
    const kept = await db.query.user.findFirst({ where: eq(schema.user.id, first) });
    assert(!!kept && kept.email.endsWith("@retired.invalid"), "the first user still exists, set aside");
    const orgs = await db.select().from(schema.membership).where(eq(schema.membership.userId, first));
    assert(orgs.length > 0, "its orgs and memberships are untouched");

    const second = await googleSignUp("Second");
    assert((await whoSignsIn()) === second, "the same Google account now signs in as the second user");

    const past = await pastUsersOf({ id: second, email: EMAIL });
    assert(past.length === 1 && past[0].id === first && !!past[0].username, "the second user can see the first one to switch back to");

    await db.transaction(async (tx) => {
      await retireUser(tx, second);
      await restoreUser(tx, first);
    });
    assert((await whoSignsIn()) === first, "after switching back: Google signs in as the first user again");
    const restored = await db.query.user.findFirst({ where: eq(schema.user.id, first) });
    assert(restored?.email === EMAIL, "the first user has its email back");
    const pastNow = await pastUsersOf({ id: first, email: EMAIL });
    assert(pastNow.length === 1 && pastNow[0].id === second, "and the second user is now the one set aside");

    process.env.ZEQQAT_PUBLIC_URL = "https://zeqqat.com";
    assert((await pastUsersOf({ id: first, email: EMAIL })).length === 0, "on zeqqat.com dev tools stay off even with the flag");
    console.log("dev tools flow passed");
  } finally {
    await closePool();
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
