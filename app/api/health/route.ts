import { Pool } from "pg";
import { APP_VERSION } from "../../../lib/version";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

export async function GET() {
  try {
    await pool.query("SELECT 1");
    return Response.json({ ok: true, db: true, version: APP_VERSION });
  } catch {
    return Response.json({ ok: false, db: false, version: APP_VERSION }, { status: 503 });
  }
}
