// Playwright's webServer. Starts a throwaway Postgres, migrates it, signs in
// a test user, then runs the app against it. Everything is created fresh
// per run, so the tests never touch a real database or real credentials.
//
// The app only has Google sign-in, so the test user and session are made
// directly through Better Auth's own adapter (which also runs the signup
// hook that creates the workspace), and the cookie is signed the same way
// Better Auth signs it.

import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { E2E_BASE_URL, E2E_PORT, STORAGE_STATE } from "./constants";

const PG_PORT = 54329;

async function main() {
  const dataDir = mkdtempSync(join(tmpdir(), "zeqqat-e2e-pg-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PG_PORT,
    user: "postgres",
    password: "postgres",
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("zeqqat");

  // Registered before the app exists, so an interrupted run still stops Postgres.
  const running: { app?: ChildProcess } = {};
  const shutdown = async () => {
    running.app?.kill("SIGTERM");
    await pg.stop().catch(() => {});
    rmSync(dataDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const env = {
    DATABASE_URL: `postgresql://postgres:postgres@localhost:${PG_PORT}/zeqqat`,
    ZEQQAT_PUBLIC_URL: E2E_BASE_URL,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    ZEQQAT_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    ENABLED_AUTH_PROVIDERS: "google",
    GOOGLE_CLIENT_ID: "e2e",
    GOOGLE_CLIENT_SECRET: "e2e",
    // Test runs are not installs: never ping zeqqat.com from CI.
    ZEQQAT_TELEMETRY: "0",
  };
  Object.assign(process.env, env);

  // Imported only now: these modules read the env above when they load.
  const { db } = await import("../../db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db, { migrationsFolder: join(__dirname, "../../db/migrations") });
  await signInTestUser();

  // CI runs the production build the same way the Dockerfile does; locally
  // the dev server avoids a full build on every run.
  const [command, args] = process.env.CI ? standaloneServer() : ["pnpm", ["exec", "next", "dev", "-p", String(E2E_PORT)]];
  const app = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env, PORT: String(E2E_PORT), HOSTNAME: "localhost" },
  });
  running.app = app;
  app.on("exit", (code) => {
    void pg.stop().finally(() => process.exit(code ?? 1));
  });
}

// Needs `pnpm build` first. Copies static assets next to the standalone
// server, as the Dockerfile does.
function standaloneServer(): [string, string[]] {
  const root = join(__dirname, "../..");
  const standalone = join(root, ".next/standalone");
  cpSync(join(root, ".next/static"), join(standalone, ".next/static"), { recursive: true });
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
  return ["node", [join(standalone, "server.js")]];
}

async function signInTestUser() {
  const { auth } = await import("../../lib/auth");
  const { makeSignature } = await import("better-auth/crypto");
  const ctx = await auth.$context;

  const user = await ctx.internalAdapter.createUser(
    { name: "E2E User", email: "e2e@example.com", emailVerified: true },
    { method: "admin" },
  );
  const session = await ctx.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, ctx.secret);

  mkdirSync(dirname(STORAGE_STATE), { recursive: true });
  writeFileSync(
    STORAGE_STATE,
    JSON.stringify({
      cookies: [
        {
          name: ctx.authCookies.sessionToken.name,
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
