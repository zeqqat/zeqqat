import { join } from "node:path";
import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./db";

const MIGRATIONS = join(process.cwd(), "db/migrations");

// How to tell, from the schema itself, that a migration already ran. Used
// only for a database that was migrated before migrations ran on startup
// (by hand, with no record in drizzle's own table): those migrations are
// recorded as done instead of being run again on top of existing tables.
// Add a line here only if a database could exist that ran a migration
// without the record, which can't happen from 0003 on.
const ALREADY_APPLIED_CHECKS = [
  sql`select to_regclass('public.call_log') is not null as ok`,
  sql`select to_regclass('public.rate_limit_bucket') is not null as ok`,
  sql`select exists (select 1 from information_schema.columns where table_name = 'call_log' and column_name = 'request_args') as ok`,
];

async function check(q: ReturnType<typeof sql>) {
  const res = await db.execute(q);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

async function baselineIfNeeded() {
  const hasRecord = await check(sql`select to_regclass('drizzle.__drizzle_migrations') is not null as ok`);
  if (hasRecord) return;
  const hasTables = await check(ALREADY_APPLIED_CHECKS[0]);
  if (!hasTables) return; // empty database: migrate() runs everything

  const files = readMigrationFiles({ migrationsFolder: MIGRATIONS });
  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(
    sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`,
  );
  for (let i = 0; i < ALREADY_APPLIED_CHECKS.length && i < files.length; i++) {
    if (!(await check(ALREADY_APPLIED_CHECKS[i]))) break;
    await db.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${files[i].hash}, ${files[i].folderMillis})`,
    );
    console.log(`[zeqqat] recorded existing migration ${i} as already applied`);
  }
}

// Applies pending database migrations before the first request, so a
// deploy that ships a schema change can't serve pages against the old
// schema. Set ZEQQAT_AUTO_MIGRATE=0 to skip it (for example when
// migrations are run by hand).
//
// A failed migration is logged, not thrown: one clear error line in the
// Dokploy logs is easier to act on than a crash loop.
export async function runMigrations() {
  if (process.env.ZEQQAT_AUTO_MIGRATE === "0" || !process.env.DATABASE_URL) return;
  try {
    await baselineIfNeeded();
    await migrate(db, { migrationsFolder: MIGRATIONS });
    console.log("[zeqqat] database migrations are up to date");
  } catch (err) {
    console.error("[zeqqat] database migration failed:", err);
  }
}
