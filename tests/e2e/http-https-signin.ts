// Sign-in works whether a self-hosted install is reached over http or https,
// whatever scheme ZEQQAT_PUBLIC_URL says. Dokploy's template creates the
// domain with no certificate, so a fresh install is served over http while
// its URL says https; before the fix, sign-up there was refused ("invalid
// origin") and the session cookie was Secure-only, so the browser dropped it.
// Real route handler, real Better Auth, throwaway Postgres.
//
//   pnpm exec tsx tests/e2e/http-https-signin.ts

import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PG_PORT = 54337;
const HOST = "zq-test.example";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok - ${msg}`);
}

function req(path: string, scheme: "http" | "https", opts: { body?: unknown; cookie?: string; host?: string } = {}) {
  const host = opts.host ?? HOST;
  const headers = new Headers({
    host,
    "x-forwarded-proto": scheme,
    "x-forwarded-host": host,
    origin: `${scheme}://${host}`,
    "content-type": "application/json",
  });
  if (opts.cookie) headers.set("cookie", opts.cookie);
  // Inside the container, Next sees the plain internal address; only the
  // forwarded headers say how the browser came in.
  return new Request(`http://127.0.0.1:3000/api/auth${path}`, {
    method: opts.body ? "POST" : "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

// "name=value" of the session cookie a response sets, and its raw header.
function sessionCookie(res: Response): { pair: string; raw: string } | null {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0];
    if (/session_token=/.test(pair) && !/=;?$/.test(pair)) return { pair, raw };
  }
  return null;
}

async function main() {
  const parent = mkdtempSync(join(tmpdir(), "zeqqat-scheme-pg-"));
  chmodSync(parent, 0o777);
  const pg = new EmbeddedPostgres({ databaseDir: join(parent, "data"), port: PG_PORT, user: "postgres", password: "postgres", persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  let closePool = async () => {};
  try {
    delete process.env.ZEQQAT_EDITION;
    delete process.env.ENABLED_AUTH_PROVIDERS;
    Object.assign(process.env, {
      NODE_ENV: "production",
      DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
      // What the Dokploy template sets, while Dokploy serves plain http.
      ZEQQAT_PUBLIC_URL: `https://${HOST}`,
      BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
    });
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { db } = await import("../../db");
    closePool = async () => (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
    await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });

    const { auth } = await import("../../lib/auth");
    const route = await import("../../app/api/auth/[...all]/route");
    const owner = { name: "Owner", email: "owner@acme.test", password: "correct-horse-1" };

    // The bug, through the old single setup: http is refused.
    const before = await auth.handler(req("/sign-up/email", "http", { body: owner }));
    assert(before.status === 403, `the https-only setup refuses an http sign-up (${before.status})`);

    // 1. Over http, through the route: the first account signs up.
    const up = await route.POST(req("/sign-up/email", "http", { body: owner }));
    assert(up.status === 200, `first account signs up over http (${up.status})`);
    const httpCookie = sessionCookie(up);
    assert(httpCookie, "a session cookie is set");
    assert(!httpCookie!.pair.startsWith("__Secure-"), `the http cookie has no __Secure- prefix (${httpCookie!.pair.split("=")[0]})`);
    assert(!/;\s*secure/i.test(httpCookie!.raw), "the http cookie isn't Secure-only, so the browser keeps it");

    const me = await route.GET(req("/get-session", "http", { cookie: httpCookie!.pair }));
    const meBody = (await me.json()) as { user?: { email?: string } } | null;
    assert(meBody?.user?.email === owner.email, "that cookie is a working session over http");

    // 2. The same account over https gets the normal Secure cookie.
    const inHttps = await route.POST(req("/sign-in/email", "https", { body: { email: owner.email, password: owner.password } }));
    assert(inHttps.status === 200, `signs in over https (${inHttps.status})`);
    const httpsCookie = sessionCookie(inHttps);
    assert(httpsCookie?.pair.startsWith("__Secure-"), "over https the cookie keeps its __Secure- prefix");
    const meHttps = await route.GET(req("/get-session", "https", { cookie: httpsCookie!.pair }));
    assert(((await meHttps.json()) as { user?: { email?: string } } | null)?.user?.email === owner.email, "and works over https");

    // 3. Only the install's own host switches scheme.
    const other = await route.POST(
      req("/sign-in/email", "http", { body: { email: owner.email, password: owner.password }, host: "evil.example" }),
    );
    assert(other.status === 403, `another host over http is still refused (${other.status})`);

    console.log("\nall http/https sign-in checks passed");
  } finally {
    await closePool();
    await pg.stop();
    rmSync(parent, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
