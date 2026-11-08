// Email and password sign-in on a self-hosted install, through Better Auth's
// real API against a throwaway Postgres:
// - the first account creates itself (no verified email needed) and owns
//   the install; after that, sign-ups are closed
// - an invite link lets exactly its email create an account
// - sign in, wrong password, and a reset link from the install's owner
//
//   pnpm exec tsx tests/e2e/password-flow.ts

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54335;

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
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-password-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  let closePool = async () => {};
  try {
    delete process.env.ZEQQAT_EDITION;
    delete process.env.ENABLED_AUTH_PROVIDERS; // self-hosted default: password
    Object.assign(process.env, {
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
      ZEQQAT_PUBLIC_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
    });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { eq } = await import("drizzle-orm");
    const schema = await import("../../db/schema");
    const { db } = await import("../../db");
    closePool = async () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });

    const { signInProviders } = await import("../../lib/auth-providers");
    assert(signInProviders.join() === "password", "self-hosted with no ENABLED_AUTH_PROVIDERS offers password only");

    const { auth } = await import("../../lib/auth");
    const { newId } = await import("../../lib/id");
    const { sha256Hex, randomToken } = await import("../../lib/oauth-crypto");
    const { resetLinkActionFor } = await testResetHelper();

    // 1. First account: creates itself, owns the install, no verified email.
    const owner = await auth.api.signUpEmail({ body: { name: "Owner", email: "owner@acme.test", password: "correct-horse-1" } });
    assert(owner.user?.id, "first account signs up with a password");
    const [ownerRow] = await db.select().from(schema.user).where(eq(schema.user.id, owner.user.id));
    assert(ownerRow && ownerRow.emailVerified === false, "its email is not marked verified (self-hosted doesn't check)");
    const ws = await db.select().from(schema.workspace);
    assert(ws.length >= 1, "signup created its workspace");

    // 2. Nobody else can sign themselves up.
    const closed = await refused(auth.api.signUpEmail({ body: { name: "Eve", email: "eve@acme.test", password: "correct-horse-2" } }));
    assert(closed === "signups_closed", "a second sign-up without an invite is refused");

    // 3. An invite lets exactly its email in.
    const [org] = await db.select().from(schema.organization).where(eq(schema.organization.ownerUserId, owner.user.id));
    const token = randomToken();
    await db.insert(schema.invitation).values({
      id: newId(),
      organizationId: org!.id,
      email: "bea@acme.test",
      role: "member",
      tokenHash: sha256Hex(token),
      invitedByUserId: owner.user.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const wrongEmail = await refused(
      auth.api.signUpEmail({
        body: { name: "Eve", email: "eve@acme.test", password: "correct-horse-2" },
        headers: new Headers({ "x-zeqqat-invite": token }),
      }),
    );
    assert(wrongEmail === "signups_closed", "an invite doesn't work for a different email");
    const bea = await auth.api.signUpEmail({
      body: { name: "Bea", email: "bea@acme.test", password: "correct-horse-3" },
      headers: new Headers({ "x-zeqqat-invite": token }),
    });
    assert(bea.user?.id, "the invited email creates its account");

    // 4. Sign in.
    const ok = await auth.api.signInEmail({ body: { email: "bea@acme.test", password: "correct-horse-3" } });
    assert(ok.token, "signs in with the right password");
    const bad = await refused(auth.api.signInEmail({ body: { email: "bea@acme.test", password: "wrong-password" } }));
    assert(bad === "INVALID_EMAIL_OR_PASSWORD", "a wrong password is refused");

    // 5. Reset link made the way the owner's Team page makes it.
    const resetToken = await resetLinkActionFor(bea.user.id);
    await auth.api.resetPassword({ body: { newPassword: "brand-new-pass-4", token: resetToken } });
    const old = await refused(auth.api.signInEmail({ body: { email: "bea@acme.test", password: "correct-horse-3" } }));
    assert(old === "INVALID_EMAIL_OR_PASSWORD", "after reset, the old password no longer works");
    const fresh = await auth.api.signInEmail({ body: { email: "bea@acme.test", password: "brand-new-pass-4" } });
    assert(fresh.token, "after reset, the new password signs in");
    const reused = await refused(auth.api.resetPassword({ body: { newPassword: "another-pass-55", token: resetToken } }));
    assert(reused === "INVALID_TOKEN", "a reset link works only once");

    const short = await refused(
      auth.api.signUpEmail({ body: { name: "X", email: "x@acme.test", password: "short" }, headers: new Headers({ "x-zeqqat-invite": token }) }),
    );
    assert(short !== null, "short passwords are refused");

    console.log("\nAll password checks passed.");
  } finally {
    await closePool().catch(() => {});
    await pg.stop().catch(() => {});
    rmSync(parent, { recursive: true, force: true });
  }

  // The same token the Team page's action mints (lib/actions/password.ts),
  // without the session check a server action needs.
  async function testResetHelper() {
    const { auth } = await import("../../lib/auth");
    const { randomToken } = await import("../../lib/oauth-crypto");
    return {
      async resetLinkActionFor(userId: string) {
        const t = randomToken(24);
        const ctx = await auth.$context;
        await ctx.internalAdapter.createVerificationValue({ value: userId, identifier: `reset-password:${t}`, expiresAt: new Date(Date.now() + 86_400_000) });
        return t;
      },
    };
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
