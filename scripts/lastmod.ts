// Refreshes content/lastmod.json: every page whose content changed since
// the last run gets today's date (see lib/lastmod.ts). `pnpm bump` runs it;
// run it by hand with `pnpm lastmod`.
import fs from "node:fs";
import { LASTMOD_PATH, readLastmod, refreshLastmod } from "../lib/lastmod";

const today = new Date().toISOString().slice(0, 10);
const { next, changed } = refreshLastmod(readLastmod(), today);
fs.writeFileSync(LASTMOD_PATH, JSON.stringify(next, null, 2) + "\n");
console.log(changed.length ? `lastmod: ${today} for ${changed.join(", ")}` : "lastmod: no page changed");
process.exit(0);
